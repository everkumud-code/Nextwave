import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hasCurrentMarketingConsent } from "@/lib/campaign-audience-rules";
import { renderMessageTemplate, findUnsupportedTemplateVariables } from "@/lib/message-template";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to queue campaigns." }, { status: 403 });

  const { campaignId } = await route.params;
  try {
    const result = await prisma.$transaction(async tx => {
      const campaign = await tx.campaign.findFirst({
        where: { id: campaignId, organizationId: context.organization.id },
        select: {
          id: true, name: true, messageBody: true, status: true, scheduledAt: true, senderId: true,
          sender: { select: { id: true, organizationId: true, status: true, archivedAt: true } },
          recipients: { select: { contactId: true } },
        },
      });
      if (!campaign) return { error: "Campaign not found.", statusCode: 404 as const };
      if (campaign.status !== "DRAFT") return { error: "Only draft campaigns can be queued.", statusCode: 409 as const };
      if (!campaign.messageBody?.trim()) return { error: "Add message content before queueing.", statusCode: 400 as const };
      if (findUnsupportedTemplateVariables(campaign.messageBody).length) return { error: "Fix unsupported message variables before queueing.", status: 400 as const };
      if (!campaign.sender || !campaign.senderId || campaign.sender.organizationId !== context.organization.id || campaign.sender.status !== "CONNECTED" || campaign.sender.archivedAt) {
        return { error: "Assign an active connected sender before queueing.", status: 409 as const };
      }
      if (campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()) {
        return { error: "This campaign has a future planned send time. Scheduled dispatch is not enabled yet; queue it after that time or clear the schedule.", status: 409 as const };
      }
      const selectedIds = [...new Set(campaign.recipients.map(item => item.contactId))];
      if (selectedIds.length === 0) return { error: "Select at least one recipient before queueing.", status: 400 as const };
      if (selectedIds.length > 5000) return { error: "Campaign exceeds the 5,000-recipient queue limit.", status: 400 as const };

      const contacts = await tx.contact.findMany({
        where: {
          organizationId: context.organization.id,
          id: { in: selectedIds },
          status: "ACTIVE",
          consents: { some: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED" } },
        },
        select: {
          id: true, phoneNumberE164: true, firstName: true, lastName: true, company: true,
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
          status: 409 as const,
          eligibleCount: eligible.length,
          selectedCount: selectedIds.length,
        };
      }

      const messages = eligible.map(contact => ({
        organizationId: context.organization.id,
        campaignId: campaign.id,
        senderId: campaign.senderId,
        recipientE164: contact.phoneNumberE164,
        body: renderMessageTemplate(campaign.messageBody!, {
          firstName: contact.firstName,
          lastName: contact.lastName,
          company: contact.company,
          phoneNumber: contact.phoneNumberE164,
        }),
        status: "QUEUED" as const,
        idempotencyKey: `campaign:${campaign.id}:contact:${contact.id}`,
      }));
      const created = await tx.message.createMany({ data: messages, skipDuplicates: true });
      await tx.campaignRecipient.updateMany({
        where: { campaignId: campaign.id, status: "PENDING" },
        data: { status: "QUEUED" },
      });
      await tx.campaign.update({ where: { id: campaign.id }, data: { status: "QUEUED" } });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "campaign.queued",
          resourceType: "Campaign",
          resourceId: campaign.id,
          metadata: { recipientCount: eligible.length, createdMessageCount: created.count, senderId: campaign.senderId },
        },
      });
      return { campaignId: campaign.id, recipientCount: eligible.length, queuedCount: created.count, status: "QUEUED" as const };
    }, { isolationLevel: "Serializable" });

    if ("error" in result) return NextResponse.json(result, { status: result.statusCode });
    return NextResponse.json({ result, message: "Campaign jobs are durably queued. Message delivery requires an enabled dispatch worker." }, { status: 202 });
  } catch (error) {
    console.error("Campaign queue operation failed", error);
    return NextResponse.json({ error: "Unable to queue campaign. Retry the operation; message creation is idempotent." }, { status: 500 });
  }
}
