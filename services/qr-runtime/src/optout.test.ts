import test, { after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { e164FromJid, isOptOutText, normalizeReply, recordOptOut } from "./optout.js";

const databaseAvailable = Boolean(process.env.DATABASE_URL);
const prisma = new PrismaClient();
after(async () => { await prisma.$disconnect(); });

test("only a whole reply made of an opt-out word counts", () => {
  for (const text of ["STOP", " stop. ", "Unsubscribe", "Band karo", "बंद करो", "opt-out", "Stop!!"]) assert.equal(isOptOutText(text), true, text);
  for (const text of ["I will stop by tomorrow", "please do not stop the offer", "ok", "", null, undefined, "stopping"]) assert.equal(isOptOutText(text as string | null | undefined), false, String(text));
  assert.equal(normalizeReply("  Stop!  "), "stop");
});

test("only phone-number addresses give a number", () => {
  assert.equal(e164FromJid("919876543210@s.whatsapp.net"), "+919876543210");
  assert.equal(e164FromJid("919876543210:12@s.whatsapp.net"), "+919876543210");
  assert.equal(e164FromJid("123456789012345@lid"), null);
  assert.equal(e164FromJid("120363@g.us"), null);
  assert.equal(e164FromJid(null), null);
});

test("an opt-out reply withdraws consent, cancels waiting messages and refunds them, once", { skip: !databaseAvailable }, async () => {
  const organization = await prisma.organization.create({ data: { name: "Opt-out integration", slug: `optout-${randomUUID()}` } });
  try {
    const account = await prisma.creditAccount.create({ data: { organizationId: organization.id, balancePaise: 500, pricePerMessagePaise: 100 } });
    const contact = await prisma.contact.create({
      data: {
        organizationId: organization.id, phoneNumber: "9876543299", phoneNumberE164: "+919876543299", status: "ACTIVE",
        consents: { create: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED", source: "INTEGRATION_TEST", grantedAt: new Date() } },
      },
    });
    await prisma.message.createMany({
      data: [
        { organizationId: organization.id, recipientE164: "+919876543299", body: "a", idempotencyKey: `optout:${organization.id}:1`, chargePaise: 100, nextAttemptAt: new Date(Date.now() + 3_600_000) },
        { organizationId: organization.id, recipientE164: "+919876543299", body: "b", idempotencyKey: `optout:${organization.id}:2`, chargePaise: 100, nextAttemptAt: new Date(Date.now() + 7_200_000) },
      ],
    });
    const first = await recordOptOut(prisma, { organizationId: organization.id, recipientE164: "+919876543299", evidenceRef: "wamid.TEST" });
    assert.deepEqual(first, { applied: true, cancelledMessages: 2, refundedPaise: 200 });
    const after1 = await prisma.contact.findUniqueOrThrow({ where: { id: contact.id } });
    assert.equal(after1.status, "UNSUBSCRIBED");
    const latest = await prisma.consentRecord.findFirstOrThrow({ where: { contactId: contact.id }, orderBy: { createdAt: "desc" } });
    assert.equal(latest.status, "WITHDRAWN");
    assert.equal(latest.source, "WHATSAPP_REPLY");
    const messages = await prisma.message.findMany({ where: { organizationId: organization.id } });
    assert.ok(messages.every(message => message.status === "CANCELLED"));
    const wallet = await prisma.creditAccount.findUniqueOrThrow({ where: { id: account.id } });
    assert.equal(wallet.balancePaise, 700);
    const second = await recordOptOut(prisma, { organizationId: organization.id, recipientE164: "+919876543299", evidenceRef: "wamid.TEST2" });
    assert.equal(second.applied, false);
    assert.equal((await prisma.creditAccount.findUniqueOrThrow({ where: { id: account.id } })).balancePaise, 700);
    const other = await recordOptOut(prisma, { organizationId: organization.id, recipientE164: "+919000000000", evidenceRef: null });
    assert.equal(other.applied, false);
  } finally {
    await prisma.message.deleteMany({ where: { organizationId: organization.id } });
    await prisma.organization.delete({ where: { id: organization.id } });
  }
});
