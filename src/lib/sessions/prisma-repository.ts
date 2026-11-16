import { Prisma, PrismaClient } from "@prisma/client";
import type { QrSession, QrSessionRepository } from "./types";

type DbSession = Prisma.QrSessionGetPayload<Record<string, never>>;

function fromDb(record: DbSession): QrSession {
  return {
    id: record.id,
    organizationId: record.organizationId,
    senderId: record.senderId,
    ownership: record.ownership,
    status: record.status,
    providerSessionId: record.providerSessionId ?? undefined,
    credentialRef: record.credentialRef ?? undefined,
    connectedAt: record.connectedAt?.toISOString(),
    lastSeenAt: record.lastSeenAt?.toISOString(),
    lastErrorCode: record.lastErrorCode ?? undefined,
    lastErrorMessage: record.lastErrorMessage ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * PostgreSQL-backed session repository.
 * Pairing payloads are intentionally excluded from persistence.
 */
export class PrismaQrSessionRepository implements QrSessionRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(session: QrSession): Promise<QrSession> {
    const record = await this.db.qrSession.create({
      data: {
        id: session.id,
        organizationId: session.organizationId,
        senderId: session.senderId,
        ownership: session.ownership,
        status: session.status,
        providerSessionId: session.providerSessionId,
        activeKey: `${session.organizationId}:${session.senderId}`,
        credentialRef: session.credentialRef,
        connectedAt: session.connectedAt ? new Date(session.connectedAt) : undefined,
        lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : undefined,
        lastErrorCode: session.lastErrorCode,
        lastErrorMessage: session.lastErrorMessage,
      },
    });

    // Pairing data is returned to the initiating request only; never stored.
    return { ...fromDb(record), pairingPayload: session.pairingPayload, pairingExpiresAt: session.pairingExpiresAt };
  }

  async findById(organizationId: string, sessionId: string): Promise<QrSession | null> {
    const record = await this.db.qrSession.findFirst({
      where: { id: sessionId, organizationId },
    });
    return record ? fromDb(record) : null;
  }

  async findBySender(organizationId: string, senderId: string): Promise<QrSession | null> {
    const record = await this.db.qrSession.findFirst({
      where: { organizationId, senderId, status: { notIn: ["DISCONNECTED", "REVOKED", "ERROR"] } },
      orderBy: { updatedAt: "desc" },
    });
    return record ? fromDb(record) : null;
  }

  async update(organizationId: string, sessionId: string, patch: Partial<QrSession>): Promise<QrSession> {
    const data: Prisma.QrSessionUpdateManyMutationInput = {};

    if (patch.ownership !== undefined) data.ownership = patch.ownership;
    if (patch.status !== undefined) data.status = patch.status;
    if (patch.providerSessionId !== undefined) data.providerSessionId = patch.providerSessionId;
    if ("credentialRef" in patch) data.credentialRef = patch.credentialRef ?? null;
    if ("connectedAt" in patch) data.connectedAt = patch.connectedAt ? new Date(patch.connectedAt) : null;
    if ("lastSeenAt" in patch) data.lastSeenAt = patch.lastSeenAt ? new Date(patch.lastSeenAt) : null;
    if ("lastErrorCode" in patch) data.lastErrorCode = patch.lastErrorCode ?? null;
    if ("lastErrorMessage" in patch) data.lastErrorMessage = patch.lastErrorMessage ?? null;
    if (patch.status === "REVOKED") data.revokedAt = new Date();
    if (patch.status === "REVOKED" || patch.status === "DISCONNECTED" || patch.status === "ERROR") data.activeKey = null;
    if (patch.status === "CONNECTED" || patch.status === "QR_PENDING" || patch.status === "PAIRING" || patch.status === "RECONNECTING") data.activeKey = `${organizationId}:${(await this.findById(organizationId, sessionId))?.senderId ?? ""}`;

    const result = await this.db.qrSession.updateMany({
      where: { id: sessionId, organizationId },
      data,
    });
    if (result.count !== 1) throw new Error("QR session not found in this organization.");

    const record = await this.db.qrSession.findFirst({ where: { id: sessionId, organizationId } });
    if (!record) throw new Error("QR session disappeared after update.");
    return fromDb(record);
  }
}
