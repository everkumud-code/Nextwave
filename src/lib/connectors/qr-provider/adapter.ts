import { prisma } from "@/lib/db/prisma";
import type {
  ConnectInput,
  ConnectResult,
  ConnectorCapabilities,
  ConnectorHealth,
  ConnectionState,
  MessagingConnector,
  SendMessageInput,
  SendMessageResult,
} from "../types";

function runtimeConfig() {
  const baseUrl = process.env.QR_SESSION_SERVICE_URL?.replace(/\/+$/, "") || "";
  const token = process.env.QR_SESSION_SERVICE_TOKEN || "";
  const timeoutMs = Math.max(1000, Number(process.env.QR_SESSION_REQUEST_TIMEOUT_MS || 30_000));
  return { baseUrl, token, timeoutMs, configured: Boolean(baseUrl && token) };
}

export class ExperimentalQrProviderAdapter implements MessagingConnector {
  readonly type = "QR_SESSION" as const;
  readonly displayName = "Self-hosted QR session";

  getCapabilities(): ConnectorCapabilities {
    return {
      configured: runtimeConfig().configured,
      supportsTemplates: false,
      supportsMedia: false,
      supportsInboundMessages: true,
      supportsDeliveryEvents: false,
      requiresProviderApproval: false,
      experimental: true,
    };
  }

  async connect(_input: ConnectInput): Promise<ConnectResult> {
    return {
      state: "PENDING",
      userActionRequired: true,
      instructions: "Start QR pairing from Sender Manager. Session lifecycle is managed by the QR runtime API.",
    };
  }

  async disconnect(senderId: string, organizationId: string): Promise<void> {
    const session = await prisma.qrSession.findFirst({
      where: { senderId, organizationId, status: { notIn: ["REVOKED", "DISCONNECTED", "ERROR"] } },
      select: { providerSessionId: true },
      orderBy: { createdAt: "desc" },
    });
    if (!session?.providerSessionId) return;
    const config = runtimeConfig();
    if (!config.configured) throw new Error("QR session runtime is not configured.");
    const response = await fetch(`${config.baseUrl}/v1/sessions/${encodeURIComponent(session.providerSessionId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ organizationId }),
      signal: AbortSignal.timeout(config.timeoutMs),
    });
    if (!response.ok) throw new Error("QR runtime could not revoke the sender session.");
  }

  async getConnectionStatus(senderId: string, organizationId: string): Promise<ConnectionState> {
    const sender = await prisma.sender.findFirst({
      where: { id: senderId, organizationId, archivedAt: null },
      select: { status: true },
    });
    if (sender?.status === "CONNECTED") return "CONNECTED";
    if (sender?.status === "ATTENTION") return "ATTENTION";
    if (sender?.status === "PENDING") return "PENDING";
    return "DISCONNECTED";
  }

  async healthCheck(senderId: string, organizationId: string): Promise<ConnectorHealth> {
    const config = runtimeConfig();
    if (!config.configured) return { state: "DISCONNECTED", checkedAt: new Date().toISOString(), detail: "QR session runtime URL or service token is missing." };
    try {
      const response = await fetch(`${config.baseUrl}/healthz`, { signal: AbortSignal.timeout(config.timeoutMs) });
      if (!response.ok) return { state: "ATTENTION", checkedAt: new Date().toISOString(), detail: "QR session runtime health check failed." };
      return { state: await this.getConnectionStatus(senderId, organizationId), checkedAt: new Date().toISOString() };
    } catch {
      return { state: "ATTENTION", checkedAt: new Date().toISOString(), detail: "QR session runtime is unreachable." };
    }
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    const config = runtimeConfig();
    if (!config.configured) {
      return { accepted: false, state: "FAILED", errorCode: "CONNECTOR_NOT_CONFIGURED", errorMessage: "Configure QR_SESSION_SERVICE_URL and QR_SESSION_SERVICE_TOKEN." };
    }
    if (!/^\+[1-9]\d{7,14}$/.test(input.recipient)) {
      return { accepted: false, state: "FAILED", errorCode: "INVALID_RECIPIENT", errorMessage: "Recipient must be an E.164 phone number." };
    }
    try {
      const response = await fetch(`${config.baseUrl}/v1/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationId: input.organizationId,
          senderId: input.senderId,
          recipient: input.recipient,
          body: input.body,
          idempotencyKey: input.idempotencyKey,
          lockToken: input.lockToken,
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
      const data = await response.json().catch(() => ({})) as { providerMessageId?: string; error?: string; errorCode?: string };
      if (!response.ok) {
        const errorCode = data.errorCode || (response.status === 401 ? "AUTHENTICATION_FAILED" : response.status === 429 ? "RATE_LIMITED" : response.status >= 500 ? "TEMPORARY_PROVIDER_ERROR" : response.status === 404 ? "SENDER_NOT_CONNECTED" : "INVALID_MESSAGE");
        return { accepted: false, state: "FAILED", errorCode, errorMessage: data.error || "QR runtime rejected the message." };
      }
      if (!data.providerMessageId) {
        return { accepted: false, state: "FAILED", errorCode: "TEMPORARY_PROVIDER_ERROR", errorMessage: "QR runtime did not return a provider message identifier." };
      }
      return { accepted: true, state: "SUBMITTED", providerMessageId: data.providerMessageId };
    } catch (error) {
      return {
        accepted: false,
        state: "FAILED",
        errorCode: "NETWORK_ERROR",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "QR runtime request failed.",
      };
    }
  }
}
