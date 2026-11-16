import type {
  CreateQrSessionInput,
  QrPairingChallenge,
  QrSessionProvider,
  QrSessionStatus,
} from "./types";

type ServiceSessionStatus = {
  status: QrSessionStatus;
  connectedAt?: string;
  lastSeenAt?: string;
  pairingPayload?: string;
  pairingExpiresAt?: string;
  credentialRef?: string;
  errorCode?: string;
  errorMessage?: string;
};

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`QR session service returned an invalid ${field}.`);
  }
  return value;
}

/**
 * Adapter for the separately deployed NextWave QR session service.
 * The service token is server-side only and is never returned to the browser.
 */
export class HttpQrSessionProvider implements QrSessionProvider {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(config?: { baseUrl?: string; token?: string; timeoutMs?: number }) {
    const baseUrl = config?.baseUrl ?? process.env.QR_SESSION_SERVICE_URL;
    const token = config?.token ?? process.env.QR_SESSION_SERVICE_TOKEN;
    if (!baseUrl || !token) {
      throw new Error("QR_SESSION_SERVICE_URL and QR_SESSION_SERVICE_TOKEN must be configured.");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
    this.timeoutMs = config?.timeoutMs ?? Number(process.env.QR_SESSION_REQUEST_TIMEOUT_MS ?? 10000);
  }

  async createSession(input: CreateQrSessionInput): Promise<QrPairingChallenge> {
    const data = await this.request("/v1/sessions", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return {
      providerSessionId: requiredString(data.sessionId, "sessionId"),
      payload: requiredString(data.qrPayload, "qrPayload"),
      expiresAt: requiredString(data.expiresAt, "expiresAt"),
    };
  }

  async getStatus(providerSessionId: string): Promise<ServiceSessionStatus> {
    const data = await this.request(`/v1/sessions/${encodeURIComponent(providerSessionId)}`, {
      method: "GET",
    });
    const allowed: QrSessionStatus[] = [
      "CREATED", "QR_PENDING", "PAIRING", "CONNECTED", "RECONNECTING",
      "DISCONNECTED", "REVOKED", "ERROR",
    ];
    if (typeof data.status !== "string" || !allowed.includes(data.status as QrSessionStatus)) {
      throw new Error("QR session service returned an unknown session status.");
    }
    return {
      status: data.status as QrSessionStatus,
      connectedAt: typeof data.connectedAt === "string" ? data.connectedAt : undefined,
      lastSeenAt: typeof data.lastSeenAt === "string" ? data.lastSeenAt : undefined,
      pairingPayload: typeof data.qrPayload === "string" ? data.qrPayload : undefined,
      pairingExpiresAt: typeof data.expiresAt === "string" ? data.expiresAt : undefined,
      credentialRef: typeof data.credentialRef === "string" ? data.credentialRef : undefined,
      errorCode: typeof data.errorCode === "string" ? data.errorCode : undefined,
      errorMessage: typeof data.errorMessage === "string" ? data.errorMessage : undefined,
    };
  }

  async revokeSession(providerSessionId: string): Promise<void> {
    await this.request(`/v1/sessions/${encodeURIComponent(providerSessionId)}`, {
      method: "DELETE",
    });
  }

  private async request(path: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${this.token}`,
        "content-type": "application/json",
        ...init.headers,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      // Avoid returning raw upstream response bodies that may contain secrets.
      throw new Error(`QR session service request failed with status ${response.status}.`);
    }
    if (response.status === 204) return {};
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("QR session service returned an invalid response.");
    }
    return payload as Record<string, unknown>;
  }
}
