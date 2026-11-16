import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { claimQueuedMessages, markMessageSubmitted, retryOrFailMessage } from "./worker";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
after(async () => { if (databaseAvailable) await prisma.$disconnect(); });

test("PostgreSQL queue claims are exclusive, leased and idempotency constrained", { skip: !databaseAvailable }, async () => {
  const organizationId = `queue-integration-${randomUUID()}`;
  const created = await prisma.message.createMany({
    data: Array.from({ length: 6 }, (_, index) => ({
      organizationId,
      recipientE164: `+91987654${String(index).padStart(4, "0")}`,
      body: `integration message ${index}`,
      idempotencyKey: `integration:${organizationId}:${index}`,
      nextAttemptAt: new Date(Date.now() - 60_000),
    })),
  });
  assert.equal(created.count, 6);

  try {
    const [first, second] = await Promise.all([
      claimQueuedMessages(3),
      claimQueuedMessages(3),
    ]);
    const claimedIds = [...first, ...second].map(message => message.id);
    assert.equal(claimedIds.length, 6);
    assert.equal(new Set(claimedIds).size, 6);
    assert.equal(first.length, 3);
    assert.equal(second.length, 3);
    assert.ok(first.every(message => message.lockToken === first[0].lockToken));
    assert.ok(second.every(message => message.lockToken === second[0].lockToken));

    const submitted = await markMessageSubmitted({
      messageId: first[0].id,
      lockToken: first[0].lockToken,
      providerMessageId: `provider-${organizationId}-1`,
    });
    assert.equal(submitted.count, 1);
    const staleLease = await markMessageSubmitted({
      messageId: first[0].id,
      lockToken: first[0].lockToken,
      providerMessageId: "stale-provider-reference",
    });
    assert.equal(staleLease.count, 0);

    const retry = await retryOrFailMessage({
      messageId: first[1].id,
      lockToken: first[1].lockToken,
      attemptCount: first[1].attemptCount,
      maxAttempts: first[1].maxAttempts,
      errorCode: "NETWORK_ERROR",
      errorMessage: "simulated transient network issue",
      retryable: true,
    });
    assert.equal(retry.count, 1);
    const retried = await prisma.message.findUniqueOrThrow({ where: { id: first[1].id } });
    assert.equal(retried.status, "QUEUED");
    assert.equal(retried.lockToken, null);
    assert.ok(retried.nextAttemptAt.getTime() > Date.now());

    await assert.rejects(
      prisma.message.create({
        data: {
          organizationId,
          recipientE164: "+919876543210",
          body: "duplicate",
          idempotencyKey: `integration:${organizationId}:0`,
        },
      }),
      error => Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002"),
    );
  } finally {
    await prisma.message.deleteMany({ where: { organizationId } });
  }
});

test("PostgreSQL queue recovers expired leases and terminalizes exhausted jobs", { skip: !databaseAvailable }, async () => {
  const organizationId = `queue-recovery-${randomUUID()}`;
  const stale = await prisma.message.create({
    data: {
      organizationId,
      recipientE164: "+919876543210",
      body: "recover lease",
      idempotencyKey: `stale:${organizationId}`,
      attemptCount: 1,
      maxAttempts: 3,
      lockedAt: new Date(Date.now() - 10 * 60_000),
      lockToken: "expired-lock",
      nextAttemptAt: new Date(Date.now() - 60_000),
    },
  });
  const exhausted = await prisma.message.create({
    data: {
      organizationId,
      recipientE164: "+919876543211",
      body: "exhausted",
      idempotencyKey: `exhausted:${organizationId}`,
      attemptCount: 3,
      maxAttempts: 3,
      nextAttemptAt: new Date(Date.now() - 60_000),
    },
  });

  try {
    const claimed = await claimQueuedMessages(10);
    const recovered = claimed.find(message => message.id === stale.id);
    assert.ok(recovered);
    assert.equal(recovered.attemptCount, 2);
    assert.notEqual(recovered.lockToken, "expired-lock");

    const terminal = await prisma.message.findUniqueOrThrow({ where: { id: exhausted.id } });
    assert.equal(terminal.status, "FAILED");
    assert.equal(terminal.errorCode, "MAX_ATTEMPTS_EXCEEDED");
  } finally {
    await prisma.message.deleteMany({ where: { organizationId } });
  }
});
