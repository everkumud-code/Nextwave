import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { CONTENT_SELECT } from "@/lib/campaign-content";
import { prisma } from "@/lib/db/prisma";
import { getEligibleWhatsAppMarketingContactIds } from "@/lib/campaign-audience";
import { nextCampaignCode } from "@/lib/ids";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

/** Makes a new draft from a campaign: the same text, file and sender, and the same people who can still be messaged. */
export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to create campaigns." }, { status: 403 });
  const { campaignId } = await route.params;
  const organizationId = context.organization.id;
  const source = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: { name: true, description: true, messageBody: true, mediaAssetId: true, senderId: true, extraSenderIds: true, ...CONTENT_SELECT, recipients: { select: { contactId: true } } },
  });
  if (!source) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  const eligible = new Set(await getEligibleWhatsAppMarketingContactIds(organizationId, 100000));
  const contactIds = source.recipients.map(recipient => recipient.contactId).filter(id => eligible.has(id));
  const campaign = await prisma.$transaction(async tx => {
    const created = await tx.campaign.create({
      data: {
        organizationId, campaignCode: await nextCampaignCode(tx, organizationId), name: `${source.name} (copy)`.slice(0, 120), description: source.description, messageBody: source.messageBody,
        mediaAssetId: source.mediaAssetId, senderId: source.senderId, extraSenderIds: source.extraSenderIds, locationLat: source.locationLat, locationLng: source.locationLng, locationName: source.locationName, locationAddress: source.locationAddress, templateName: source.templateName, templateLanguage: source.templateLanguage, templateParams: source.templateParams, status: "DRAFT", channel: "WHATSAPP",
        recipients: { create: contactIds.map(contactId => ({ contactId, status: "PENDING" as const })) },
      },
      select: { id: true, campaignCode: true },
    });
    await tx.auditLog.create({
      data: { organizationId, actorUserId: context.user.id, action: "campaign.cloned", resourceType: "Campaign", resourceId: created.id, metadata: { from: campaignId, recipientCount: contactIds.length } },
    });
    return created;
  }, { maxWait: 10_000, timeout: 120_000 });
  return NextResponse.json({ campaign, recipientCount: contactIds.length, skipped: source.recipients.length - contactIds.length }, { status: 201 });
}
