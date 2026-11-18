import { Prisma } from "@prisma/client";
import { hasCurrentMarketingConsent } from "@/lib/campaign-audience-rules";
import { findUnsupportedTemplateVariables } from "@/lib/message-template";
import { getCustomFieldKeys } from "@/lib/custom-fields";
import { enqueueCampaignMessages } from "./enqueue";
import { usableExtraSenderIds } from "./extra-senders";

export type ScheduledCampaignResult =
  | { campaignId: string; status: "QUEUED"; recipientCount: number; queuedCount: number }
  | { campaignId: string; status: "FAILED"; reason: string }
  | { campaignId: string; status: "SKIPPED" };

export async function queueDueScheduledCampaign(
  tx: Prisma.TransactionClient,
  campaignId: string,
  now = new Date(),
): Promise<ScheduledCampaignResult> {
  const campaign = await tx.campaign.findFirst({
    where: { id: campaignId, status: "SCHEDULED", scheduledAt: { lte: now } },
    select: {
      id: true, organizationId: true, name: true, messageBody: true, senderId: true, mediaAssetId: true, extraSenderIds: true,
      sender: { select: { id: true, organizationId: true, status: true, archivedAt: true } },
      recipients: { select: { contactId: true } },
    },
  });
  if (!campaign) return { campaignId, status: "SKIPPED" };

  const reject = async (reason: string): Promise<ScheduledCampaignResult> => {
    const changed = await tx.campaign.updateMany({
      where: { id: campaign.id, organizationId: campaign.organizationId, status: "SCHEDULED" },
      data: { status: "FAILED", completedAt: now },
    });
    if (changed.count) {
      await tx.auditLog.create({
        data: {
          organizationId: campaign.organizationId,
          actorType: "SYSTEM",
          action: "campaign.schedule_blocked",
          resourceType: "Campaign",
          resourceId: campaign.id,
          metadata: { reason },
        },
      });
      return { campaignId, status: "FAILED", reason };
    }
    return { campaignId, status: "SKIPPED" };
  };

  if (!campaign.messageBody?.trim() && !campaign.mediaAssetId) return reject("Message content is missing.");
  if (campaign.messageBody && findUnsupportedTemplateVariables(campaign.messageBody, await getCustomFieldKeys(campaign.organizationId)).length) return reject("Message contains unsupported template variables.");
  if (!campaign.senderId || !campaign.sender || campaign.sender.organizationId !== campaign.organizationId || campaign.sender.status !== "CONNECTED" || campaign.sender.archivedAt) {
    return reject("The assigned sender is no longer connected.");
  }

  const selectedIds = [...new Set(campaign.recipients.map(item => item.contactId))];
  if (!selectedIds.length || selectedIds.length > 50000) return reject("The scheduled audience is empty or exceeds the 50,000-recipient limit.");

  const contacts = await tx.contact.findMany({
    where: {
      organizationId: campaign.organizationId,
      id: { in: selectedIds },
      status: "ACTIVE",
      consents: { some: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED" } },
    },
    select: {
      id: true, phoneNumberE164: true, firstName: true, lastName: true, company: true, customFields: true,
      consents: {
        where: { channel: "WHATSAPP", purpose: "MARKETING" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { status: true },
      },
    },
  });
  const eligible = contacts.filter(contact => hasCurrentMarketingConsent(contact.consents));
  if (eligible.length !== selectedIds.length) return reject("The audience changed or consent was withdrawn before scheduled dispatch.");

  const claimed = await tx.campaign.updateMany({
    where: { id: campaign.id, organizationId: campaign.organizationId, status: "SCHEDULED", scheduledAt: { lte: now } },
    data: { status: "QUEUED", startedAt: now },
  });
  if (!claimed.count) return { campaignId, status: "SKIPPED" };

  const outcome = await enqueueCampaignMessages(tx, {
    organizationId: campaign.organizationId,
    campaign: { id: campaign.id, messageBody: campaign.messageBody ?? "", mediaAssetId: campaign.mediaAssetId, senderId: campaign.senderId!, extraSenderIds: await usableExtraSenderIds(tx, campaign.organizationId, campaign.senderId!, campaign.extraSenderIds) },
    eligible,
    actorUserId: null,
    now,
  });
  if (!outcome.ok) {
    // not enough prepaid credit at the planned time: nothing is sent and nobody is charged
    const failed = await tx.campaign.updateMany({
      where: { id: campaign.id, organizationId: campaign.organizationId, status: "QUEUED" },
      data: { status: "FAILED", completedAt: now },
    });
    if (failed.count) {
      await tx.auditLog.create({
        data: {
          organizationId: campaign.organizationId,
          actorType: "SYSTEM",
          action: "campaign.schedule_blocked",
          resourceType: "Campaign",
          resourceId: campaign.id,
          metadata: { reason: "Insufficient prepaid credit at the scheduled time.", balancePaise: outcome.balancePaise, requiredPaise: outcome.requiredPaise },
        },
      });
    }
    return { campaignId, status: "FAILED", reason: "Insufficient prepaid credit at the scheduled time." };
  }
  const created = { count: outcome.queuedCount };
  await tx.campaignRecipient.updateMany({
    where: { campaignId: campaign.id, status: "PENDING" },
    data: { status: "QUEUED" },
  });
  await tx.auditLog.create({
    data: {
      organizationId: campaign.organizationId,
      actorType: "SYSTEM",
      action: "campaign.scheduled_queued",
      resourceType: "Campaign",
      resourceId: campaign.id,
      metadata: { recipientCount: eligible.length, createdMessageCount: created.count, senderId: campaign.senderId, chargedPaise: outcome.chargedPaise, pricePerMessagePaise: outcome.pricePerMessagePaise },
    },
  });
  return { campaignId, status: "QUEUED", recipientCount: eligible.length, queuedCount: created.count };
}
