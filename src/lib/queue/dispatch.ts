import { prisma } from "@/lib/db/prisma";
import { hasCurrentMarketingConsent } from "@/lib/campaign-audience-rules";
import { createConnectorRegistry } from "@/lib/connectors";
import { isRetryableConnectorError } from "./retry-policy";
import { claimQueuedMessages, markMessageSubmitted, retryOrFailMessage, type ClaimedMessage } from "./worker";
import { shouldPauseForFailures } from "./auto-pause";
import { dailyLimitForAge, daysSince, startOfLocalDay, startOfNextLocalDay } from "./daily-limit";

export type DispatchBatchResult = { claimed: number; submitted: number; retried: number; failed: number; deferred: number };

async function reconcileCampaign(organizationId: string, campaignId: string) {
  const [remaining, successful, failed] = await Promise.all([
    prisma.message.count({ where: { organizationId, campaignId, status: { in: ["QUEUED", "SUBMITTED", "SENT"] } } }),
    prisma.message.count({ where: { organizationId, campaignId, status: { in: ["DELIVERED", "READ"] } } }),
    prisma.message.count({ where: { organizationId, campaignId, status: "FAILED" } }),
  ]);
  if (remaining > 0) return;
  await prisma.campaign.updateMany({
    where: { id: campaignId, organizationId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: successful === 0 && failed > 0 ? "FAILED" : "COMPLETED", completedAt: new Date() },
  });
}

/** Stops a campaign by itself and records why; the owner resumes it from the campaign page. */
async function autoPauseCampaign(organizationId: string, campaignId: string, reason: string) {
  const paused = await prisma.campaign.updateMany({
    where: { id: campaignId, organizationId, status: { in: ["QUEUED", "RUNNING"] } },
    data: { status: "PAUSED" },
  });
  if (paused.count) {
    await prisma.auditLog.create({
      data: {
        organizationId,
        actorType: "SYSTEM",
        action: "campaign.auto_paused",
        resourceType: "Campaign",
        resourceId: campaignId,
        metadata: { reason },
      },
    });
  }
}

/** Too many of the latest messages failed to deliver: pause before the number is hurt further. */
async function pauseIfFailing(organizationId: string, campaignId: string) {
  const recent = await prisma.message.findMany({
    where: { organizationId, campaignId, status: { in: ["FAILED", "SUBMITTED", "SENT", "DELIVERED", "READ"] } },
    orderBy: { updatedAt: "desc" },
    take: 25,
    select: { status: true, errorCode: true },
  });
  if (shouldPauseForFailures(recent)) {
    await autoPauseCampaign(organizationId, campaignId, "At least 5 of the last 10 messages failed to deliver. Check the sender, then resume.");
  }
}

/**
 * The number has reached today's allowance: hand the message back untouched (its attempt is not counted) and give it a slot
 * after the messages already waiting for tomorrow, so that the next day starts with the usual spacing and not with a burst.
 */
async function deferToNextDay(job: ClaimedMessage, senderId: string, timeZone: string) {
  const tomorrow = startOfNextLocalDay(new Date(), timeZone);
  const [tail, account] = await Promise.all([
    prisma.message.findFirst({
      where: { organizationId: job.organizationId, senderId, status: "QUEUED", nextAttemptAt: { gte: tomorrow }, id: { not: job.id } },
      orderBy: { nextAttemptAt: "desc" },
      select: { nextAttemptAt: true },
    }),
    prisma.creditAccount.findUnique({ where: { organizationId: job.organizationId }, select: { defaultIntervalSeconds: true } }),
  ]);
  const intervalMs = Math.max(10, Math.min(90, account?.defaultIntervalSeconds || 60)) * 1000;
  const slot = tail ? new Date(tail.nextAttemptAt.getTime() + intervalMs) : tomorrow;
  await prisma.message.updateMany({
    where: { id: job.id, status: "QUEUED", lockToken: job.lockToken },
    data: { lockedAt: null, lockToken: null, attemptCount: { decrement: 1 }, nextAttemptAt: slot },
  });
}

export async function dispatchQueuedBatch(limit = 25): Promise<DispatchBatchResult> {
  const registry = createConnectorRegistry();
  const hasConfiguredConnector = registry.list().some(item => registry.get(item.type).getCapabilities().configured);
  if (!hasConfiguredConnector) return { claimed: 0, submitted: 0, retried: 0, failed: 0, deferred: 0 };
  const jobs = await claimQueuedMessages(limit);
  const result: DispatchBatchResult = { claimed: jobs.length, submitted: 0, retried: 0, failed: 0, deferred: 0 };

  for (const job of jobs) {
    let recipientContactId: string | null = null;
    const fail = async (errorCode: string, errorMessage: string, retryable = isRetryableConnectorError(errorCode)) => {
      const persisted = await prisma.message.findFirst({
        where: { id: job.id, status: "QUEUED", lockToken: job.lockToken },
        select: { providerMessageId: true },
      });
      if (persisted?.providerMessageId) {
        const accepted = await markMessageSubmitted({
          messageId: job.id,
          lockToken: job.lockToken,
          providerMessageId: persisted.providerMessageId,
        });
        if (accepted.count) {
          if (job.campaignId && recipientContactId) {
            await prisma.campaignRecipient.updateMany({
              where: { campaignId: job.campaignId, contactId: recipientContactId, status: "QUEUED" },
              data: { status: "SUBMITTED" },
            });
          }
          result.submitted += 1;
          return;
        }
      }
      const update = await retryOrFailMessage({
        messageId: job.id,
        lockToken: job.lockToken,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        errorCode,
        errorMessage,
        retryable,
      });
      if (update.count) {
        const terminal = !retryable || job.attemptCount >= job.maxAttempts;
        if (terminal) {
          result.failed += 1;
          if (job.campaignId && recipientContactId) {
            await prisma.campaignRecipient.updateMany({
              where: { campaignId: job.campaignId, contactId: recipientContactId, status: "QUEUED" },
              data: { status: "FAILED" },
            });
          }
          if (job.campaignId) {
            await reconcileCampaign(job.organizationId, job.campaignId);
            await pauseIfFailing(job.organizationId, job.campaignId);
          }
        } else result.retried += 1;
      }
    };

    try {
      const [sender, contact] = await Promise.all([
        job.senderId ? prisma.sender.findFirst({
          where: { id: job.senderId, organizationId: job.organizationId, archivedAt: null },
          select: {
            id: true, connector: true, status: true, createdAt: true,
            organization: { select: { timezone: true } },
            sessions: { where: { connectedAt: { not: null } }, orderBy: { connectedAt: "asc" }, take: 1, select: { connectedAt: true } },
          },
        }) : null,
        prisma.contact.findFirst({
          where: { organizationId: job.organizationId, phoneNumberE164: job.recipientE164 },
          select: {
            id: true,
            status: true,
            consents: {
              where: { channel: "WHATSAPP", purpose: "MARKETING" },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: { id: true, status: true },
            },
          },
        }),
      ]);

      recipientContactId = contact?.id ?? null;
      if (!sender || sender.status !== "CONNECTED") {
        // Do not burn the campaign: give the message back untouched (its attempt is not counted), wait a minute,
        // and pause the campaign so that nothing else is tried until the owner has reconnected the number.
        await prisma.message.updateMany({
          where: { id: job.id, status: "QUEUED", lockToken: job.lockToken },
          data: { lockedAt: null, lockToken: null, attemptCount: { decrement: 1 }, nextAttemptAt: new Date(Date.now() + 60_000) },
        });
        if (job.campaignId) await autoPauseCampaign(job.organizationId, job.campaignId, "The assigned sender is not connected. Reconnect it, then resume.");
        continue;
      }
      if (!contact || contact.status !== "ACTIVE" || !hasCurrentMarketingConsent(contact.consents)) {
        await fail("CONSENT_REVOKED", "The recipient is no longer eligible under the current contact and consent state.", false);
        continue;
      }
      if (!job.body) {
        await fail("INVALID_MESSAGE", "Message body is empty.", false);
        continue;
      }
      if (sender.connector === "OTHER") {
        await fail("UNSUPPORTED_CONNECTOR", "No messaging adapter is registered for this sender connector.", false);
        continue;
      }

      // today's allowance for this number (it grows with the days since the number was first connected)
      const timeZone = sender.organization.timezone;
      const allowance = dailyLimitForAge(daysSince(sender.sessions[0]?.connectedAt ?? sender.createdAt, new Date()));
      const sentToday = await prisma.message.count({
        where: { organizationId: job.organizationId, senderId: sender.id, status: { in: ["SUBMITTED", "SENT", "DELIVERED", "READ"] }, submittedAt: { gte: startOfLocalDay(new Date(), timeZone) } },
      });
      if (sentToday >= allowance) {
        await deferToNextDay(job, sender.id, timeZone);
        result.deferred += 1;
        continue;
      }

      const connector = registry.get(sender.connector);
      const capabilities = connector.getCapabilities();
      if (!capabilities.configured) {
        await fail("CONNECTOR_NOT_CONFIGURED", `${connector.displayName} is not configured for message delivery.`, false);
        continue;
      }

      const sendResult = await connector.sendMessage({
        senderId: sender.id,
        organizationId: job.organizationId,
        recipient: job.recipientE164,
        body: job.body,
        idempotencyKey: job.idempotencyKey,
        lockToken: job.lockToken,
        consentRecordId: contact.consents[0].id,
      });

      if (!sendResult.accepted || sendResult.state === "FAILED") {
        await fail(
          sendResult.errorCode ?? "CONNECTOR_ERROR",
          sendResult.errorMessage ?? "Connector did not accept the message.",
        );
        continue;
      }

      const updated = await markMessageSubmitted({
        messageId: job.id,
        lockToken: job.lockToken,
        providerMessageId: sendResult.providerMessageId,
      });
      if (updated.count) {
        if (job.campaignId) {
          await prisma.campaignRecipient.updateMany({
            where: { campaignId: job.campaignId, contactId: contact.id, status: "QUEUED" },
            data: { status: "SUBMITTED" },
          });
        }
        result.submitted += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected connector error.";
      await fail("CONNECTOR_ERROR", message.slice(0, 1000), true);
    }
  }

  return result;
}
