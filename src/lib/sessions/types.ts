export type QrSessionStatus =
  | "CREATED"
  | "QR_PENDING"
  | "PAIRING"
  | "CONNECTED"
  | "RECONNECTING"
  | "DISCONNECTED"
  | "REVOKED"
  | "ERROR";

export type SenderOwnership = "CUSTOMER" | "PLATFORM";

export interface QrSession {
  id: string;
  organizationId: string;
  senderId: string;
  ownership: SenderOwnership;
  status: QrSessionStatus;
  providerSessionId?: string;
  /** Reference to encrypted server-side secret storage; never the secret itself. */
  credentialRef?: string;
  /** Short-lived QR payload or URL. Must never be persisted in the database. */
  pairingPayload?: string;
  pairingExpiresAt?: string;
  connectedAt?: string;
  lastSeenAt?: string;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQrSessionInput {
  organizationId: string;
  senderId: string;
  ownership: SenderOwnership;
}

export interface QrPairingChallenge {
  providerSessionId: string;
  payload: string;
  expiresAt: string;
}

export interface QrSessionProvider {
  createSession(input: CreateQrSessionInput): Promise<QrPairingChallenge>;
  getStatus(providerSessionId: string): Promise<{
    status: QrSessionStatus;
    connectedAt?: string;
    lastSeenAt?: string;
    credentialRef?: string;
    errorCode?: string;
    errorMessage?: string;
  }>;
  revokeSession(providerSessionId: string): Promise<void>;
}

export interface QrSessionRepository {
  create(session: QrSession): Promise<QrSession>;
  findById(organizationId: string, sessionId: string): Promise<QrSession | null>;
  findBySender(organizationId: string, senderId: string): Promise<QrSession | null>;
  update(organizationId: string, sessionId: string, patch: Partial<QrSession>): Promise<QrSession>;
}
