import { prisma } from "@/lib/db/prisma";
import { hasCurrentMarketingConsent } from "@/lib/campaign-audience-rules";
import { createConnectorRegistry } from "@/lib/connectors";
import { isRetryableConnectorError } from "./retry-policy";
import { claimQueuedMessages, markMessageSubmitted, retryOrFailMessage } from "./worker";

export type DispatchBatchResult = { claimed: number; submitted: number; retried: number; failed: number };

export async function dispatchQueuedBatch(limit = 25): Promise<DispatchBatchResult> {
  const jobs = await claimQueuedMessages(limit);
  const registry = createConnectorRegistry();
  const result: DispatchBatchResult = { claimed: jobs.length, submitted: 0, retried: 0, failed: 0 };

  for (const job of jobs) {
    let recipientContactId: string | null = null;
    const fail = async (errorCode: string, errorMessage: string, retryable = isRetryableConnectorError(errorCode)) => {
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
        } else result.retried += 1;
      }
    };

    try {
      const [sender, contact] = await Promise.all([
        job.senderId ? prisma.sender.findFirst({
          where: { id: job.senderId, organizationId: job.organizationId, archivedAt: null },
          select: { id: true, connector: true, status: true },
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
        await fail("SENDER_NOT_CONNECTED", "The assigned sender is no longer connected.", false);
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
