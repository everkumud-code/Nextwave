import { strict as assert } from "node:assert";
import { test } from "node:test";
import { QrSessionManager } from "./manager";
import type {
  CreateQrSessionInput,
  QrSession,
  QrSessionProvider,
  QrSessionRepository,
} from "./types";

class MemoryRepository implements QrSessionRepository {
  readonly records = new Map<string, QrSession>();

  async create(session: QrSession) {
    const persisted = { ...session, pairingPayload: undefined, pairingExpiresAt: undefined };
    this.records.set(session.id, persisted);
    return { ...persisted, pairingPayload: session.pairingPayload, pairingExpiresAt: session.pairingExpiresAt };
  }

  async findById(organizationId: string, sessionId: string) {
    const record = this.records.get(sessionId);
    return record?.organizationId === organizationId ? record : null;
  }

  async findBySender(organizationId: string, senderId: string) {
    return [...this.records.values()].find((record) =>
      record.organizationId === organizationId &&
      record.senderId === senderId &&
      !["DISCONNECTED", "REVOKED", "ERROR"].includes(record.status)
    ) ?? null;
  }

  async update(organizationId: string, sessionId: string, patch: Partial<QrSession>) {
    const record = await this.findById(organizationId, sessionId);
    if (!record) throw new Error("QR session not found in this organization.");
    const updated = { ...record, ...patch };
    this.records.set(sessionId, updated);
    return updated;
  }
}

class FakeProvider implements QrSessionProvider {
  revoked: Array<{ id: string; organizationId: string }> = [];
  status: Awaited<ReturnType<QrSessionProvider["getStatus"]>> = { status: "QR_PENDING" };

  async createSession(_input: CreateQrSessionInput) {
    return {
      providerSessionId: "runtime-session-1",
      payload: "initial-qr-payload",
      expiresAt: "2026-11-16T12:05:00.000Z",
    };
  }

  async getStatus(_providerSessionId: string, _organizationId: string) {
    return this.status;
  }

  async revokeSession(providerSessionId: string, organizationId: string) {
    this.revoked.push({ id: providerSessionId, organizationId });
  }
}

const input: CreateQrSessionInput = {
  organizationId: "org-1",
  senderId: "sender-1",
  ownership: "CUSTOMER",
};

test("create returns a transient QR payload without persisting it", async () => {
  const provider = new FakeProvider();
  const repository = new MemoryRepository();
  const manager = new QrSessionManager(provider, repository);

  const created = await manager.create(input);
  const stored = repository.records.get(created.id);

  assert.equal(created.pairingPayload, "initial-qr-payload");
  assert.equal(stored?.pairingPayload, undefined);
  assert.equal(stored?.pairingExpiresAt, undefined);
  assert.equal(created.providerSessionId, "runtime-session-1");
});

test("refresh returns the current QR payload from the runtime", async () => {
  const provider = new FakeProvider();
  const repository = new MemoryRepository();
  const manager = new QrSessionManager(provider, repository);
  const created = await manager.create(input);

  provider.status = {
    status: "QR_PENDING",
    pairingPayload: "rotated-qr-payload",
    pairingExpiresAt: "2026-11-16T12:06:00.000Z",
  };
  const refreshed = await manager.refresh(input.organizationId, created.id);

  assert.equal(refreshed.pairingPayload, "rotated-qr-payload");
  assert.equal(refreshed.pairingExpiresAt, "2026-11-16T12:06:00.000Z");
});

test("revoke passes tenant identity to the runtime and clears credentials", async () => {
  const provider = new FakeProvider();
  const repository = new MemoryRepository();
  const manager = new QrSessionManager(provider, repository);
  const created = await manager.create(input);
  await repository.update(input.organizationId, created.id, { credentialRef: "qrcred:runtime-session-1" });

  const revoked = await manager.revoke(input.organizationId, created.id);

  assert.deepEqual(provider.revoked, [{ id: "runtime-session-1", organizationId: "org-1" }]);
  assert.equal(revoked.status, "REVOKED");
  assert.equal(revoked.credentialRef, undefined);
});

test("session lookup never crosses organization boundaries", async () => {
  const manager = new QrSessionManager(new FakeProvider(), new MemoryRepository());
  const created = await manager.create(input);

  await assert.rejects(
    manager.refresh("another-org", created.id),
    /not found in this organization/,
  );
});
