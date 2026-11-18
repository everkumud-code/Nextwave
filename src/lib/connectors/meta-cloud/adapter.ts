import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/secret-box";
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
import { GraphRequestError, getPhoneInfo, mapGraphError, sendTemplateMessage } from "./graph";

/** The access token and phone number ID of an official sender (the token is stored encrypted). */
export async function loadOfficialCredentials(senderId: string, organizationId: string): Promise<{ phoneNumberId: string; wabaId: string; token: string } | null> {
  const sender = await prisma.sender.findFirst({
    where: { id: senderId, organizationId, connector: "META_CLOUD_API", archivedAt: null },
    select: { providerAccountRef: true, providerCredential: { select: { wabaId: true, accessTokenEnc: true } } },
  });
  if (!sender?.providerAccountRef || !sender.providerCredential) return null;
  try {
    return { phoneNumberId: sender.providerAccountRef, wabaId: sender.providerCredential.wabaId, token: decryptSecret(sender.providerCredential.accessTokenEnc) };
  } catch {
    return null;
  }
}

/**
 * WhatsApp Cloud API (the official route) for large lists. A business-started chat can only use an approved template,
 * so a message here is always a template with the words for its {{1}}, {{2}} ... Status updates and replies arrive on /api/webhooks/meta.
 */
export class MetaCloudApiAdapter implements MessagingConnector {
  readonly type = "META_CLOUD_API" as const;
  readonly displayName = "WhatsApp Cloud API (official)";

  getCapabilities(): ConnectorCapabilities {
    return {
      configured: true,
      supportsTemplates: true,
      supportsMedia: false,
      supportsInboundMessages: true,
      supportsDeliveryEvents: true,
      requiresProviderApproval: true,
      experimental: false,
    };
  }

  async connect(_input: ConnectInput): Promise<ConnectResult> {
    return { state: "PENDING", userActionRequired: true, instructions: "Add the phone number ID, business account ID and access token from Meta when you add the sender." };
  }

  async disconnect(senderId: string, organizationId: string): Promise<void> {
    await prisma.providerCredential.deleteMany({ where: { senderId, organizationId } });
  }

  async getConnectionStatus(senderId: string, organizationId: string): Promise<ConnectionState> {
    const sender = await prisma.sender.findFirst({ where: { id: senderId, organizationId, archivedAt: null }, select: { status: true } });
    if (sender?.status === "CONNECTED") return "CONNECTED";
    if (sender?.status === "ATTENTION") return "ATTENTION";
    if (sender?.status === "PENDING") return "PENDING";
    return "DISCONNECTED";
  }

  async healthCheck(senderId: string, organizationId: string): Promise<ConnectorHealth> {
    const credentials = await loadOfficialCredentials(senderId, organizationId);
    if (!credentials) return { state: "DISCONNECTED", checkedAt: new Date().toISOString(), detail: "The access token of this sender is missing." };
    try {
      await getPhoneInfo(credentials.token, credentials.phoneNumberId);
      return { state: "CONNECTED", checkedAt: new Date().toISOString() };
    } catch (error) {
      return { state: "ATTENTION", checkedAt: new Date().toISOString(), detail: error instanceof Error ? error.message : "Meta could not be reached." };
    }
  }

  async sendMessage(input: SendMessageInput): Promise<SendMessageResult> {
    if (!input.template) {
      return { accepted: false, state: "FAILED", errorCode: "INVALID_MESSAGE", errorMessage: "An official WhatsApp number can only send an approved template." };
    }
    if (!/^\+[1-9]\d{7,14}$/.test(input.recipient)) {
      return { accepted: false, state: "FAILED", errorCode: "INVALID_RECIPIENT", errorMessage: "Recipient must be an E.164 phone number." };
    }
    const credentials = await loadOfficialCredentials(input.senderId, input.organizationId);
    if (!credentials) return { accepted: false, state: "FAILED", errorCode: "AUTHENTICATION_FAILED", errorMessage: "The access token of this sender is missing. Add it again." };
    try {
      const providerMessageId = await sendTemplateMessage(credentials.token, credentials.phoneNumberId, input.recipient.slice(1), input.template);
      return { accepted: true, state: "SUBMITTED", providerMessageId };
    } catch (error) {
      if (error instanceof GraphRequestError) {
        const mapped = mapGraphError(error.detail);
        return { accepted: false, state: "FAILED", ...mapped };
      }
      return { accepted: false, state: "FAILED", errorCode: "TEMPORARY_PROVIDER_ERROR", errorMessage: error instanceof Error ? error.message.slice(0, 300) : "Unexpected error." };
    }
  }
}
