import { emailConfirmationMissing } from "@/lib/auth-tokens";
import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hasCurrentMarketingConsent } from "@/lib/campaign-audience-rules";
import { CONTENT_SELECT, campaignPin, campaignTemplate, contentProblem } from "@/lib/campaign-content";
import { usableExtraSenderIds } from "@/lib/queue/extra-senders";
import { findUnsupportedTemplateVariables } from "@/lib/message-template";
import { getCustomFieldKeys } from "@/lib/custom-fields";
import { mediaProblem } from "@/lib/media";
import { enqueueCampaignMessages } from "@/lib/queue/enqueue";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (await emailConfirmationMissing(context.user)) return NextResponse.json({ error: "Please confirm your e-mail address first (we sent you a link). You can ask for a new one from the banner at the top of the dashboard." }, { status: 403 });
  const body = await _request.json().catch(() => ({}));
  const requestedOrganizationId = typeof body.organizationId === "string" ? body.organizationId : null;
  const isAdmin = isPlatformAdminUser(context.user);
  if (requestedOrganizationId && !isAdmin) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });
  if (!requestedOrganizationId && !canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to queue campaigns." }, { status: 403 });
  const organizationId = requestedOrganizationId || context.organization.id;

  const { campaignId } = await route.params;
  try {
    const result = await prisma.$transaction(async tx => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, organizationId: organizationId },
        select: {
          id: true, name: true, messageBody: true, status: true, scheduledAt: true, senderId: true, extraSenderIds: true, mediaAssetId: true, ...CONTENT_SELECT, mediaAsset: { select: { kind: true } },
          sender: { select: { id: true, organizationId: true, status: true, archivedAt: true, connector: true } },
          recipients: { select: { contactId: true } },
        },
      });
      if (!campaign) return { error: "Campaign not found.", statusCode: 404 as const };
      if (campaign.status !== "DRAFT") return { error: "Only draft campaigns can be queued.", statusCode: 409 as const };
      const contentIssue = contentProblem(campaign, campaign.sender?.connector);
      if (contentIssue) return { error: contentIssue, statusCode: 400 as const };
      const mediaIssue = mediaProblem(campaign.mediaAsset?.kind, campaign.messageBody);
      if (mediaIssue) return { error: mediaIssue, statusCode: 400 as const };
      if (campaign.messageBody && findUnsupportedTemplateVariables(campaign.messageBody, await getCustomFieldKeys(organizationId)).length) return { error: "Fix unsupported message variables before queueing.", statusCode: 400 as const };
      if (!campaign.sender || !campaign.senderId || campaign.sender.organizationId !== organizationId || campaign.sender.status !== "CONNECTED" || campaign.sender.archivedAt) {
        return { error: "Assign an active connected sender before queueing.", statusCode: 409 as const };
      }
      if (campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()) {
        return { error: "This campaign has a future planned send time. Scheduled dispatch is not enabled yet; queue it after that time or clear the schedule.", statusCode: 409 as const };
      }
      const selectedIds = [...new Set(campaign.recipients.map(item => item.contactId))];
      if (selectedIds.length === 0) return { error: "Select at least one recipient before queueing.", statusCode: 400 as const };
      if (selectedIds.length > 50000) return { error: "Campaign exceeds the 50,000-recipient queue limit.", statusCode: 400 as const };

      const contacts = await tx.contact.findMany({
        where: {
          organizationId: organizationId,
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
      if (eligible.length !== selectedIds.length) {
        return {
          error: "The audience changed since the draft was saved. Refresh recipients and resolve withdrawn consent or inactive contacts before queueing.",
          statusCode: 409 as const,
          eligibleCount: eligible.length,
          selectedCount: selectedIds.length,
        };
      }

      const outcome = await enqueueCampaignMessages(tx, {
        organizationId,
        campaign: { id: campaign.id, messageBody: campaign.messageBody ?? "", mediaAssetId: campaign.mediaAssetId, location: campaignPin(campaign), template: campaignTemplate(campaign), senderId: campaign.senderId!, extraSenderIds: await usableExtraSenderIds(tx, organizationId, campaign.senderId!, campaign.extraSenderIds) },
        eligible,
        actorUserId: context.user.id,
      });
      if (!outcome.ok) {
        return {
          error: "Insufficient prepaid credits. Please contact your account administrator to top up before queueing this campaign.",
          statusCode: 402 as const,
          balancePaise: outcome.balancePaise,
          requiredPaise: outcome.requiredPaise,
          pricePerMessagePaise: outcome.pricePerMessagePaise,
        };
      }
      const created = { count: outcome.queuedCount };
      const actualChargePaise = outcome.chargedPaise;
      const balanceAfterPaise = outcome.balanceAfterPaise;
      const account = { pricePerMessagePaise: outcome.pricePerMessagePaise, defaultIntervalSeconds: outcome.intervalSeconds };

      await tx.campaignRecipient.updateMany({
        where: { campaignId: campaign.id, status: "PENDING" },
        data: { status: "QUEUED" },
      });
      await tx.campaign.update({ where: { id: campaign.id }, data: { status: "QUEUED" } });
      await tx.auditLog.create({
        data: {
          organizationId: organizationId,
          actorUserId: context.user.id,
          action: "campaign.queued",
          resourceType: "Campaign",
          resourceId: campaign.id,
          metadata: { recipientCount: eligible.length, createdMessageCount: created.count, senderId: campaign.senderId, chargedPaise: actualChargePaise, pricePerMessagePaise: account.pricePerMessagePaise, intervalSeconds: account.defaultIntervalSeconds },
        },
      });
      return { campaignId: campaign.id, recipientCount: eligible.length, queuedCount: created.count, chargedPaise: actualChargePaise, balanceAfterPaise, pricePerMessagePaise: account.pricePerMessagePaise, intervalSeconds: account.defaultIntervalSeconds, status: "QUEUED" as const };
    }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 180_000 });

    if ("error" in result) return NextResponse.json(result, { status: result.statusCode });
    return NextResponse.json({ result, message: "Campaign jobs are durably queued. Message delivery requires an enabled dispatch worker." }, { status: 202 });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_PREPAID_CREDIT") return NextResponse.json({ error: "Insufficient prepaid credits. Please top up before queueing this campaign." }, { status: 402 });
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") return NextResponse.json({ error: "Another request is queueing this campaign. Wait a moment and check the campaign before retrying." }, { status: 409 });
    console.error("Campaign queue operation failed", error);
    return NextResponse.json({ error: "Unable to queue campaign. Retry the operation; message creation is idempotent." }, { status: 500 });
  }
}
