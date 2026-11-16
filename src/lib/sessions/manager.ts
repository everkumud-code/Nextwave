import type {
  CreateQrSessionInput,
  QrSession,
  QrSessionProvider,
  QrSessionRepository,
} from "./types";

/**
 * Coordinates QR session lifecycle while keeping provider SDKs behind an
 * adapter. Every repository operation is scoped by organizationId.
 *
 * The repository implementation must use a durable database in production.
 * Pairing payloads are short-lived secrets: return them to the initiating
 * operator, but never persist them or log them.
 */
export class QrSessionManager {
  constructor(
    private readonly provider: QrSessionProvider,
    private readonly repository: QrSessionRepository,
  ) {}

  async create(input: CreateQrSessionInput): Promise<QrSession> {
    const existing = await this.repository.findBySender(input.organizationId, input.senderId);
    if (existing && !["DISCONNECTED", "REVOKED", "ERROR"].includes(existing.status)) {
      throw new Error("This sender already has an active or pending QR session.");
    }

    const challenge = await this.provider.createSession(input);
    const now = new Date().toISOString();

    try {
      return await this.repository.create({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        senderId: input.senderId,
        ownership: input.ownership,
        status: "QR_PENDING",
        providerSessionId: challenge.providerSessionId,
        pairingPayload: challenge.payload,
        pairingExpiresAt: challenge.expiresAt,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Avoid orphaning a provider-side session if the durable write fails.
      await this.provider.revokeSession(challenge.providerSessionId).catch(() => undefined);
      throw error;
    }
  }

  async refresh(organizationId: string, sessionId: string): Promise<QrSession> {
    const session = await this.requireSession(organizationId, sessionId);
    if (!session.providerSessionId) throw new Error("Session is missing its provider reference.");

    const remote = await this.provider.getStatus(session.providerSessionId);
    const now = new Date().toISOString();

    const updated = await this.repository.update(organizationId, sessionId, {
      status: remote.status,
      connectedAt: remote.connectedAt ?? session.connectedAt,
      lastSeenAt: remote.lastSeenAt ?? session.lastSeenAt,
      credentialRef: remote.credentialRef ?? session.credentialRef,
      lastErrorCode: remote.errorCode,
      lastErrorMessage: remote.errorMessage,
      updatedAt: now,
    });

    // Pairing data is ephemeral and retained only in the current response.
    return {
      ...updated,
      pairingPayload: remote.status === "CONNECTED" ? undefined : session.pairingPayload,
      pairingExpiresAt: remote.status === "CONNECTED" ? undefined : session.pairingExpiresAt,
    };
  }

  async revoke(organizationId: string, sessionId: string): Promise<QrSession> {
    const session = await this.requireSession(organizationId, sessionId);
    if (session.providerSessionId) {
      await this.provider.revokeSession(session.providerSessionId);
    }

    return this.repository.update(organizationId, sessionId, {
      status: "REVOKED",
      pairingPayload: undefined,
      pairingExpiresAt: undefined,
      credentialRef: undefined,
      updatedAt: new Date().toISOString(),
    });
  }

  private async requireSession(organizationId: string, sessionId: string): Promise<QrSession> {
    const session = await this.repository.findById(organizationId, sessionId);
    if (!session) throw new Error("QR session not found in this organization.");
    return session;
  }
}
