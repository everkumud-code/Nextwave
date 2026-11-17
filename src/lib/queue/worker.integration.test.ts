import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { claimQueuedMessages, markMessageSubmitted, retryOrFailMessage } from "./worker";
import { processDueScheduledCampaigns } from "./scheduler";

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

test("scheduled campaigns are atomically converted into queued recipient jobs", { skip: !databaseAvailable }, async () => {
  const organization = await prisma.organization.create({
    data: { name: "Scheduler integration", slug: `scheduler-${randomUUID()}` },
  });
  try {
    await prisma.creditAccount.create({ data: { organizationId: organization.id, balancePaise: 1000, pricePerMessagePaise: 100 } });
    const sender = await prisma.sender.create({
      data: {
        organizationId: organization.id,
        displayName: "Integration sender",
        phoneNumber: "9876543210",
        phoneNumberE164: "+919876543210",
        connector: "QR_SESSION",
        status: "CONNECTED",
      },
    });
    const contact = await prisma.contact.create({
      data: {
        organizationId: organization.id,
        phoneNumber: "9876543211",
        phoneNumberE164: "+919876543211",
        firstName: "Test",
        status: "ACTIVE",
        consents: { create: {
          channel: "WHATSAPP",
          purpose: "MARKETING",
          status: "GRANTED",
          source: "INTEGRATION_TEST",
          grantedAt: new Date(),
        } },
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizationId: organization.id,
        senderId: sender.id,
        name: "Due campaign",
        messageBody: "Hello {{firstName}}",
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() - 60_000),
        recipients: { create: [{ contactId: contact.id, status: "PENDING" }] },
      },
    });

    const result = await processDueScheduledCampaigns(10);
    assert.ok(result.scanned >= 1);
    assert.ok(result.queued >= 1);
    const queuedCampaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(queuedCampaign.status, "QUEUED");
    const message = await prisma.message.findFirstOrThrow({ where: { organizationId: organization.id, campaignId: campaign.id } });
    assert.equal(message.status, "QUEUED");
    assert.equal(message.recipientE164, contact.phoneNumberE164);
    assert.equal(message.chargePaise, 100);
    const wallet = await prisma.creditAccount.findUniqueOrThrow({ where: { organizationId: organization.id } });
    assert.equal(wallet.balancePaise, 900);
    assert.equal(await prisma.creditTransaction.count({ where: { organizationId: organization.id, type: "DEBIT", reference: `campaign:${campaign.id}` } }), 1);
    const recipient = await prisma.campaignRecipient.findFirstOrThrow({ where: { campaignId: campaign.id, contactId: contact.id } });
    assert.equal(recipient.status, "QUEUED");
  } finally {
    await prisma.message.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
  }
});

async function scheduledCampaignFixture(label: string, balancePaise: number, contactCount: number) {
  const organization = await prisma.organization.create({ data: { name: `Scheduler ${label}`, slug: `scheduler-${label}-${randomUUID()}` } });
  await prisma.creditAccount.create({ data: { organizationId: organization.id, balancePaise, pricePerMessagePaise: 100 } });
  const sender = await prisma.sender.create({
    data: { organizationId: organization.id, displayName: "Sender", phoneNumber: "9876543210", phoneNumberE164: "+919876543210", connector: "QR_SESSION", status: "CONNECTED" },
  });
  const contacts = [];
  for (let index = 0; index < contactCount; index += 1) {
    contacts.push(await prisma.contact.create({
      data: {
        organizationId: organization.id, phoneNumber: `98765432${String(index).padStart(2, "0")}`, phoneNumberE164: `+9198765432${String(index).padStart(2, "0")}`, status: "ACTIVE",
        consents: { create: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED", source: "INTEGRATION_TEST", grantedAt: new Date() } },
      },
    }));
  }
  const campaign = await prisma.campaign.create({
    data: {
      organizationId: organization.id, senderId: sender.id, name: `Due ${label}`, messageBody: "Hello", status: "SCHEDULED",
      scheduledAt: new Date(Date.now() - 60_000),
      recipients: { create: contacts.map(contact => ({ contactId: contact.id, status: "PENDING" as const })) },
    },
  });
  return { organization, campaign };
}

test("scheduled messages are spaced out per sender, not sent all at once", { skip: !databaseAvailable }, async () => {
  const { organization, campaign } = await scheduledCampaignFixture("pacing", 1000, 3);
  try {
    await processDueScheduledCampaigns(10);
    const messages = await prisma.message.findMany({ where: { campaignId: campaign.id }, orderBy: { nextAttemptAt: "asc" } });
    assert.equal(messages.length, 3);
    for (let index = 1; index < messages.length; index += 1) {
      const gap = messages[index].nextAttemptAt.getTime() - messages[index - 1].nextAttemptAt.getTime();
      assert.ok(gap >= 10_000, `gap ${gap} ms is below the 10 second minimum`);
    }
    const wallet = await prisma.creditAccount.findUniqueOrThrow({ where: { organizationId: organization.id } });
    assert.equal(wallet.balancePaise, 700);
  } finally {
    await prisma.message.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
  }
});

test("a scheduled campaign without enough prepaid credit sends nothing and charges nothing", { skip: !databaseAvailable }, async () => {
  const { organization, campaign } = await scheduledCampaignFixture("broke", 150, 3);
  try {
    await processDueScheduledCampaigns(10);
    const after = await prisma.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    assert.equal(after.status, "FAILED");
    assert.equal(await prisma.message.count({ where: { campaignId: campaign.id } }), 0);
    const wallet = await prisma.creditAccount.findUniqueOrThrow({ where: { organizationId: organization.id } });
    assert.equal(wallet.balancePaise, 150);
    assert.equal(await prisma.creditTransaction.count({ where: { organizationId: organization.id } }), 0);
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
  }
});

test("messages of a paused campaign are not claimed until it is resumed", { skip: !databaseAvailable }, async () => {
  const organization = await prisma.organization.create({ data: { name: "Pause integration", slug: `pause-${randomUUID()}` } });
  try {
    const campaign = await prisma.campaign.create({ data: { organizationId: organization.id, name: "Paused", status: "PAUSED", messageBody: "x" } });
    await prisma.message.create({
      data: { organizationId: organization.id, campaignId: campaign.id, recipientE164: "+919876500001", body: "x", idempotencyKey: `pause:${campaign.id}:1`, nextAttemptAt: new Date(Date.now() - 60_000) },
    });
    const none = (await claimQueuedMessages(100)).filter(message => message.organizationId === organization.id);
    assert.equal(none.length, 0);
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "QUEUED" } });
    const some = (await claimQueuedMessages(100)).filter(message => message.organizationId === organization.id);
    assert.equal(some.length, 1);
  } finally {
    await prisma.message.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
  }
});
