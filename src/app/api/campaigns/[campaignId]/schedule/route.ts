import { emailConfirmationMissing } from "@/lib/auth-tokens";
import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { hasCurrentMarketingConsent } from "@/lib/campaign-audience-rules";
import { CONTENT_SELECT, campaignPin, campaignTemplate, contentProblem } from "@/lib/campaign-content";
import { findUnsupportedTemplateVariables } from "@/lib/message-template";
import { getCustomFieldKeys } from "@/lib/custom-fields";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (await emailConfirmationMissing(context.user)) return NextResponse.json({ error: "Please confirm your e-mail address first (we sent you a link). You can ask for a new one from the banner at the top of the dashboard." }, { status: 403 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to schedule campaigns." }, { status: 403 });

  const { campaignId } = await route.params;
  const result = await prisma.$transaction(async tx => {
    const campaign = await tx.campaign.findFirst({
      where: { id: campaignId, organizationId: context.organization.id },
      select: {
        id: true, status: true, messageBody: true, senderId: true, scheduledAt: true, mediaAssetId: true, ...CONTENT_SELECT,
        sender: { select: { id: true, organizationId: true, status: true, archivedAt: true, connector: true } },
        recipients: { select: { contactId: true } },
      },
    });
    if (!campaign) return { error: "Campaign not found.", code: 404 };
    if (campaign.status !== "DRAFT") return { error: "Only draft campaigns can be scheduled.", code: 409 };
    if (!campaign.scheduledAt || campaign.scheduledAt.getTime() <= Date.now()) return { error: "Set a future planned send time before scheduling.", code: 400 };
    if (contentProblem(campaign, campaign.sender?.connector) || (campaign.messageBody && findUnsupportedTemplateVariables(campaign.messageBody, await getCustomFieldKeys(context.organization.id)).length)) return { error: "Add valid message content before scheduling.", code: 400 };
    if (!campaign.senderId || !campaign.sender || campaign.sender.organizationId !== context.organization.id || campaign.sender.status !== "CONNECTED" || campaign.sender.archivedAt) {
      return { error: "Assign an active connected sender before scheduling.", code: 409 };
    }
    const selectedIds = [...new Set(campaign.recipients.map(item => item.contactId))];
    if (!selectedIds.length || selectedIds.length > 50000) return { error: "Select between 1 and 50,000 recipients.", code: 400 };
    const contacts = await tx.contact.findMany({
      where: {
        organizationId: context.organization.id,
        id: { in: selectedIds },
        status: "ACTIVE",
        consents: { some: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED" } },
      },
      select: {
        id: true,
        consents: {
          where: { channel: "WHATSAPP", purpose: "MARKETING" },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 1,
          select: { status: true },
        },
      },
    });
    const eligible = contacts.filter(contact => hasCurrentMarketingConsent(contact.consents));
    if (eligible.length !== selectedIds.length) return { error: "The selected audience has changed. Refresh recipients and resolve consent issues before scheduling.", code: 409 };

    const scheduled = await tx.campaign.updateMany({
      where: { id: campaign.id, organizationId: context.organization.id, status: "DRAFT", scheduledAt: { gt: new Date() } },
      data: { status: "SCHEDULED" },
    });
    if (!scheduled.count) return { error: "Campaign changed while scheduling. Refresh and try again.", code: 409 };
    await tx.auditLog.create({
      data: {
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        action: "campaign.scheduled",
        resourceType: "Campaign",
        resourceId: campaign.id,
        metadata: { scheduledAt: campaign.scheduledAt.toISOString(), recipientCount: eligible.length, senderId: campaign.senderId },
      },
    });
    return { campaignId: campaign.id, status: "SCHEDULED" as const, scheduledAt: campaign.scheduledAt, recipientCount: eligible.length };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 60_000 });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json({ campaign: result }, { status: 202 });
}
