import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { applyPendingProviderReceipts } from "./provider-receipts";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
after(async () => { if (databaseAvailable) await prisma.$disconnect(); });

test("provider receipts arriving before provider ID persistence are applied later in order", { skip: !databaseAvailable }, async () => {
  const organization = await prisma.organization.create({
    data: { name: "Provider receipt integration", slug: `provider-receipts-${randomUUID()}` },
  });
  try {
    const sender = await prisma.sender.create({
      data: {
        organizationId: organization.id,
        displayName: "Meta test sender",
        phoneNumber: "9876543210",
        phoneNumberE164: "+919876543210",
        connector: "META_CLOUD_API",
        status: "CONNECTED",
        providerAccountRef: "test-phone-number-id",
      },
    });
    const message = await prisma.message.create({
      data: {
        organizationId: organization.id,
        senderId: sender.id,
        recipientE164: "+919876543211",
        body: "Receipt ordering test",
        idempotencyKey: randomUUID(),
        status: "SUBMITTED",
      },
    });
    const sentAt = new Date("2026-11-16T10:00:00.000Z");
    const deliveredAt = new Date("2026-11-16T10:00:05.000Z");
    await prisma.providerDeliveryReceipt.createMany({
      data: [
        { organizationId: organization.id, senderId: sender.id, providerMessageId: "meta-message-1", status: "DELIVERED", eventTimestamp: deliveredAt },
        { organizationId: organization.id, senderId: sender.id, providerMessageId: "meta-message-1", status: "SENT", eventTimestamp: sentAt },
      ],
    });

    const beforeId = await prisma.$transaction(tx => applyPendingProviderReceipts(tx, {
      organizationId: organization.id,
      senderId: sender.id,
      providerMessageId: "meta-message-1",
    }));
    assert.deepEqual(beforeId, { applied: 0, pending: true });

    await prisma.message.update({
      where: { id: message.id },
      data: { providerMessageId: "meta-message-1" },
    });
    const result = await prisma.$transaction(tx => applyPendingProviderReceipts(tx, {
      organizationId: organization.id,
      senderId: sender.id,
      providerMessageId: "meta-message-1",
    }));
    assert.equal(result.applied, 2);

    const updated = await prisma.message.findUniqueOrThrow({ where: { id: message.id } });
    assert.equal(updated.status, "DELIVERED");
    assert.equal(updated.submittedAt?.toISOString(), sentAt.toISOString());
    assert.equal(updated.deliveredAt?.toISOString(), deliveredAt.toISOString());
    assert.equal(await prisma.providerDeliveryReceipt.count({
      where: { organizationId: organization.id, senderId: sender.id, appliedAt: null },
    }), 0);
  } finally {
    await prisma.organization.delete({ where: { id: organization.id } });
  }
});
