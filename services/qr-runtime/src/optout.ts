import type { PrismaClient } from "@prisma/client";

/**
 * Opt-out by reply. A contact who answers with one of these words (and nothing else) withdraws WhatsApp
 * marketing consent: a withdrawn consent record is added, the contact is unsubscribed, and the messages
 * that are still waiting for that number are cancelled and their prepaid charge is given back.
 * Only whole-message matches count, so a sentence that merely contains "stop" does not unsubscribe anyone.
 */
const OPT_OUT_WORDS = new Set([
  "stop", "stop all", "stop messages", "stop karo", "unsubscribe", "unsub", "cancel", "end", "quit", "optout", "opt out", "opt-out",
  "remove me", "remove", "band", "band karo", "mat bhejo", "message mat bhejo", "रोको", "बंद", "बंद करो", "मत भेजो",
]);

export function normalizeReply(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/[.!?,;:'"()\[\]{}]+/g, " ").replace(/\s+/g, " ").trim();
}

export function isOptOutText(text: string | null | undefined): boolean {
  if (!text) return false;
  return OPT_OUT_WORDS.has(normalizeReply(text));
}

/** "919876543210:12@s.whatsapp.net" -> "+919876543210"; anything that is not a phone-number address -> null. */
export function e164FromJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  const match = /^(\d{8,15})(?::\d+)?@s\.whatsapp\.net$/.exec(jid);
  return match ? `+${match[1]}` : null;
}

export type OptOutResult = { applied: boolean; cancelledMessages: number; refundedPaise: number };

export async function recordOptOut(
  prisma: PrismaClient,
  input: { organizationId: string; recipientE164: string; evidenceRef: string | null },
): Promise<OptOutResult> {
  const { organizationId, recipientE164, evidenceRef } = input;
  return prisma.$transaction(async tx => {
    const contact = await tx.contact.findFirst({
      where: { organizationId, phoneNumberE164: recipientE164 },
      select: { id: true, status: true },
    });
    if (!contact) return { applied: false, cancelledMessages: 0, refundedPaise: 0 };

    const latest = await tx.consentRecord.findFirst({
      where: { contactId: contact.id, channel: "WHATSAPP", purpose: "MARKETING" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { status: true },
    });
    if (latest?.status === "WITHDRAWN" && contact.status === "UNSUBSCRIBED") return { applied: false, cancelledMessages: 0, refundedPaise: 0 };

    const record = await tx.consentRecord.create({
      data: {
        contactId: contact.id,
        channel: "WHATSAPP",
        purpose: "MARKETING",
        status: "WITHDRAWN",
        source: "WHATSAPP_REPLY",
        evidenceRef: evidenceRef ? `whatsapp-message:${evidenceRef}`.slice(0, 500) : null,
        withdrawnAt: new Date(),
      },
    });
    await tx.contact.update({ where: { id: contact.id }, data: { status: "UNSUBSCRIBED" } });

    // messages still waiting for this number are cancelled, and what was charged for them is given back
    const waiting = await tx.message.findMany({
      where: { organizationId, recipientE164, status: "QUEUED", lockToken: null },
      select: { id: true, chargePaise: true },
    });
    let refundedPaise = 0;
    if (waiting.length) {
      const cancelled = await tx.message.updateMany({
        where: { id: { in: waiting.map(item => item.id) }, status: "QUEUED", lockToken: null },
        data: { status: "CANCELLED", errorCode: "CONSENT_WITHDRAWN", errorMessage: "The contact replied with an opt-out word.", lockedAt: null },
      });
      if (cancelled.count === waiting.length) refundedPaise = waiting.reduce((sum, item) => sum + item.chargePaise, 0);
      else refundedPaise = 0;   // someone else changed a message meanwhile: leave the wallet to the manual process
      if (refundedPaise > 0) {
        const account = await tx.creditAccount.findUnique({ where: { organizationId } });
        if (account) {
          const updated = await tx.creditAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: refundedPaise } } });
          await tx.creditTransaction.create({
            data: {
              organizationId,
              accountId: account.id,
              type: "CREDIT",
              amountPaise: refundedPaise,
              balanceAfterPaise: updated.balancePaise,
              messageCount: waiting.length,
              reference: `optout:${contact.id}`,
              description: `Refund for ${waiting.length} queued message(s) cancelled after an opt-out reply`,
            },
          });
        } else refundedPaise = 0;
      }
    }
    await tx.auditLog.create({
      data: {
        organizationId,
        actorType: "SYSTEM",
        action: "contact.opted_out_by_reply",
        resourceType: "Contact",
        resourceId: contact.id,
        metadata: { consentRecordId: record.id, cancelledMessages: waiting.length, refundedPaise },
      },
    });
    return { applied: true, cancelledMessages: waiting.length, refundedPaise };
  });
}
