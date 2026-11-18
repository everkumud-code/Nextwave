import { Prisma } from "@prisma/client";
import { renderMessageTemplate } from "@/lib/message-template";

export type EnqueueContact = {
  id: string;
  phoneNumberE164: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  customFields?: unknown;
};

export type EnqueueInput = {
  organizationId: string;
  /** extraSenderIds: more connected senders that share the campaign; messages are dealt out to all of them in turn */
  campaign: { id: string; messageBody: string; mediaAssetId?: string | null; senderId: string; extraSenderIds?: string[] };
  eligible: EnqueueContact[];
  /** The person who queued the campaign; null when the scheduler does it. */
  actorUserId: string | null;
  now?: Date;
};

export type EnqueueOutcome =
  | {
      ok: true;
      queuedCount: number;
      chargedPaise: number;
      balanceAfterPaise: number;
      pricePerMessagePaise: number;
      intervalSeconds: number;
    }
  | {
      ok: false;
      reason: "INSUFFICIENT_CREDIT";
      balancePaise: number;
      requiredPaise: number;
      pricePerMessagePaise: number;
    };

/**
 * The one place where a campaign's messages are created, so that a manual queue and a scheduled
 * dispatch behave the same: the prepaid wallet is checked and debited atomically with an entry in
 * the ledger, and the messages are spaced out per sender (10 to 90 seconds apart) instead of all
 * going out at once. Message creation is idempotent per recipient (organisation + idempotency key).
 * Must run inside a Serializable transaction.
 */
export async function enqueueCampaignMessages(tx: Prisma.TransactionClient, input: EnqueueInput): Promise<EnqueueOutcome> {
  const { organizationId, campaign, eligible } = input;
  const now = input.now ?? new Date();

  const account = await tx.creditAccount.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
  const existingMessageCount = await tx.message.count({ where: { organizationId, campaignId: campaign.id } });
  const estimatedNewCount = Math.max(0, eligible.length - existingMessageCount);
  const estimatedChargePaise = estimatedNewCount * account.pricePerMessagePaise;
  if (!Number.isSafeInteger(estimatedChargePaise) || account.balancePaise < estimatedChargePaise) {
    return {
      ok: false,
      reason: "INSUFFICIENT_CREDIT",
      balancePaise: account.balancePaise,
      requiredPaise: estimatedChargePaise,
      pricePerMessagePaise: account.pricePerMessagePaise,
    };
  }

  const intervalMs = Math.max(10, Math.min(90, account.defaultIntervalSeconds || 60)) * 1000;
  // every sender has its own queue and its own pace (10 to 90 seconds between two of its messages)
  const senderIds = [...new Set([campaign.senderId, ...(campaign.extraSenderIds ?? [])])];
  const firstAttemptBySender = new Map<string, Date>();
  for (const senderId of senderIds) {
    const [pendingQueuedCount, latestQueued, latestSubmitted] = await Promise.all([
      tx.message.count({ where: { organizationId, senderId, status: "QUEUED" } }),
      tx.message.findFirst({
        where: { organizationId, senderId, status: "QUEUED" },
        orderBy: { nextAttemptAt: "desc" },
        select: { nextAttemptAt: true },
      }),
      tx.message.findFirst({
        where: { organizationId, senderId, status: { in: ["SUBMITTED", "SENT", "DELIVERED", "READ"] }, submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        select: { submittedAt: true },
      }),
    ]);
    let firstAttemptAt = new Date(now);
    if (latestQueued) {
      const queuedTail = latestQueued.nextAttemptAt > now
        ? new Date(latestQueued.nextAttemptAt.getTime() + intervalMs)
        : new Date(now.getTime() + pendingQueuedCount * intervalMs);
      if (queuedTail > firstAttemptAt) firstAttemptAt = queuedTail;
    }
    if (latestSubmitted?.submittedAt) {
      const afterLastSubmission = new Date(latestSubmitted.submittedAt.getTime() + intervalMs);
      if (afterLastSubmission > firstAttemptAt) firstAttemptAt = afterLastSubmission;
    }
    firstAttemptBySender.set(senderId, firstAttemptAt);
  }
  const sentBySender = new Map<string, number>();

  const messages = eligible.map((contact, index) => {
    const senderId = senderIds[index % senderIds.length];
    const turn = sentBySender.get(senderId) ?? 0;
    sentBySender.set(senderId, turn + 1);
    return {
    organizationId,
    campaignId: campaign.id,
    mediaAssetId: campaign.mediaAssetId ?? null,
    senderId,
    recipientE164: contact.phoneNumberE164,
    body: renderMessageTemplate(campaign.messageBody, {
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company,
      phoneNumber: contact.phoneNumberE164,
      custom: contact.customFields,
    }),
    status: "QUEUED" as const,
    idempotencyKey: `campaign:${campaign.id}:contact:${contact.id}`,
    chargePaise: account.pricePerMessagePaise,
    nextAttemptAt: new Date(firstAttemptBySender.get(senderId)!.getTime() + turn * intervalMs),
    };
  });
  const created = await tx.message.createMany({ data: messages, skipDuplicates: true });
  const actualChargePaise = created.count * account.pricePerMessagePaise;
  let balanceAfterPaise = account.balancePaise;
  if (actualChargePaise > 0) {
    const charged = await tx.creditAccount.updateMany({
      where: { id: account.id, balancePaise: { gte: actualChargePaise } },
      data: { balancePaise: { decrement: actualChargePaise } },
    });
    if (!charged.count) throw new Error("INSUFFICIENT_PREPAID_CREDIT");
    balanceAfterPaise = account.balancePaise - actualChargePaise;
    await tx.creditTransaction.create({
      data: {
        organizationId,
        accountId: account.id,
        type: "DEBIT",
        amountPaise: actualChargePaise,
        balanceAfterPaise,
        pricePerMessagePaise: account.pricePerMessagePaise,
        messageCount: created.count,
        reference: `campaign:${campaign.id}`,
        description: `Prepaid charge for ${created.count} queued campaign messages`,
        actorUserId: input.actorUserId,
      },
    });
  }
  return {
    ok: true,
    queuedCount: created.count,
    chargedPaise: actualChargePaise,
    balanceAfterPaise,
    pricePerMessagePaise: account.pricePerMessagePaise,
    intervalSeconds: account.defaultIntervalSeconds,
  };
}
