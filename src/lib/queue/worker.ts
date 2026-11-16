import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getRetryDecision } from "./retry-policy";

export type ClaimedMessage = {
  id: string;
  organizationId: string;
  campaignId: string | null;
  senderId: string | null;
  recipientE164: string;
  body: string | null;
  attemptCount: number;
  maxAttempts: number;
  lockToken: string;
};

export async function claimQueuedMessages(limit = 25): Promise<ClaimedMessage[]> {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  const lockToken = randomUUID();

  return prisma.$transaction(async tx => {
    const now = new Date();
    await tx.message.updateMany({
      where: {
        status: "QUEUED",
        attemptCount: { gte: 5 },
        nextAttemptAt: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: new Date(now.getTime() - 5 * 60_000) } }],
      },
      data: {
        status: "FAILED",
        lockToken: null,
        lockedAt: null,
        errorCode: "MAX_ATTEMPTS_EXCEEDED",
        errorMessage: "Message exceeded its retry limit.",
      },
    });

    return tx.$queryRaw<ClaimedMessage[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "Message"
        WHERE "status" = 'QUEUED'
          AND "nextAttemptAt" <= NOW()
          AND "attemptCount" < "maxAttempts"
          AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - INTERVAL '5 minutes')
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE "Message" AS message
      SET "lockedAt" = NOW(),
          "lockToken" = ${lockToken},
          "attemptCount" = message."attemptCount" + 1,
          "lastAttemptAt" = NOW(),
          "updatedAt" = NOW()
      FROM candidates
      WHERE message."id" = candidates."id"
      RETURNING message."id", message."organizationId", message."campaignId",
        message."senderId", message."recipientE164", message."body",
        message."attemptCount", message."maxAttempts", message."lockToken"
    `);
  });
}

export async function markMessageSubmitted(input: {
  messageId: string;
  lockToken: string;
  providerMessageId?: string;
}) {
  return prisma.message.updateMany({
    where: { id: input.messageId, status: "QUEUED", lockToken: input.lockToken },
    data: {
      status: "SUBMITTED",
      providerMessageId: input.providerMessageId ?? null,
      submittedAt: new Date(),
      lockedAt: null,
      lockToken: null,
      errorCode: null,
      errorMessage: null,
    },
  });
}

export async function retryOrFailMessage(input: {
  messageId: string;
  lockToken: string;
  attemptCount: number;
  maxAttempts: number;
  errorCode: string;
  errorMessage: string;
  retryable: boolean;
}) {
  const decision = input.retryable
    ? getRetryDecision({
        attemptCount: input.attemptCount,
        maxAttempts: input.maxAttempts,
        errorCode: input.errorCode,
        errorMessage: input.errorMessage,
      })
    : { retry: false, nextAttemptAt: null, errorCode: input.errorCode, errorMessage: input.errorMessage };

  return prisma.message.updateMany({
    where: { id: input.messageId, status: "QUEUED", lockToken: input.lockToken },
    data: {
      status: decision.retry ? "QUEUED" : "FAILED",
      nextAttemptAt: decision.nextAttemptAt ?? undefined,
      lockedAt: null,
      lockToken: null,
      errorCode: decision.errorCode.slice(0, 120),
      errorMessage: decision.errorMessage.slice(0, 1000),
    },
  });
}
