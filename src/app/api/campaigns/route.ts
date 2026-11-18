import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getEligibleWhatsAppMarketingContactIds } from "@/lib/campaign-audience";
import { findUnsupportedTemplateVariables } from "@/lib/message-template";
import { getCustomFieldKeys } from "@/lib/custom-fields";
import { mediaProblem } from "@/lib/media";
import { nextCampaignCode } from "@/lib/ids";

export const runtime = "nodejs";
const campaignSelect = {
  id: true, campaignCode: true, name: true, description: true, messageBody: true, status: true, channel: true,
  scheduledAt: true, createdAt: true, updatedAt: true,
  sender: { select: { id: true, displayName: true, phoneNumberE164: true, status: true } },
  mediaAsset: { select: { id: true, kind: true, filename: true, sizeBytes: true } },
  _count: { select: { recipients: true, messages: true } },
} as const;

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const requestedOrganizationId = new URL(request.url).searchParams.get("organizationId");
  const isAdmin = isPlatformAdminUser(context.user);
  if (requestedOrganizationId && !isAdmin) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });
  const organizationId = requestedOrganizationId || context.organization.id;
  const [campaigns, eligibleIds] = await Promise.all([
    prisma.campaign.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: campaignSelect,
    }),
    getEligibleWhatsAppMarketingContactIds(organizationId, 100000),
  ]);
  return NextResponse.json({ campaigns, eligibleAudience: eligibleIds.length });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const requestedOrganizationId = typeof body.organizationId === "string" ? body.organizationId : null;
    const isAdmin = isPlatformAdminUser(context.user);
    if (requestedOrganizationId && !isAdmin) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });
    if (!requestedOrganizationId && !canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to create campaigns." }, { status: 403 });
    const organizationId = requestedOrganizationId || context.organization.id;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null;
    const senderId = typeof body.senderId === "string" && body.senderId ? body.senderId : null;
    const messageBody = typeof body.messageBody === "string" ? body.messageBody.trim().slice(0, 4096) || null : null;
    if (messageBody && findUnsupportedTemplateVariables(messageBody, await getCustomFieldKeys(organizationId)).length) return NextResponse.json({ error: "Message contains unsupported template variables." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
    const mediaAssetId = typeof body.mediaAssetId === "string" && body.mediaAssetId ? body.mediaAssetId : null;
    if (mediaAssetId) {
      const asset = await prisma.mediaAsset.findFirst({ where: { id: mediaAssetId, organizationId }, select: { kind: true } });
      if (!asset) return NextResponse.json({ error: "File not found in this workspace." }, { status: 404 });
      const problem = mediaProblem(asset.kind, messageBody);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }

    if (senderId) {
      const sender = await prisma.sender.findFirst({
        where: { id: senderId, organizationId, archivedAt: null },
        select: { id: true, status: true },
      });
      if (!sender) return NextResponse.json({ error: "Sender not found in this workspace." }, { status: 404 });
      if (sender.status !== "CONNECTED") return NextResponse.json({ error: "Select a connected sender to assign this campaign." }, { status: 409 });
    }

    // a new draft starts with every eligible contact when that is a small list; with a big list the person chooses (tags, groups, search)
    const allEligible = await getEligibleWhatsAppMarketingContactIds(organizationId, 5001);
    const eligibleIds = allEligible.length > 5000 ? [] : allEligible;

    const campaign = await prisma.$transaction(async tx => {
      const created = await tx.campaign.create({
        data: {
          organizationId,
          campaignCode: await nextCampaignCode(tx, organizationId),
          name,
          description,
          messageBody,
          mediaAssetId,
          senderId,
          status: "DRAFT",
          channel: "WHATSAPP",
          recipients: { create: eligibleIds.map(contactId => ({ contactId, status: "PENDING" })) },
        },
        select: campaignSelect,
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: context.user.id,
          action: "campaign.created",
          resourceType: "Campaign",
          resourceId: created.id,
          metadata: { recipientCount: eligibleIds.length, senderId, channel: "WHATSAPP" },
        },
      });
      return created;
    }, { maxWait: 10_000, timeout: 120_000 });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("Campaign creation failed", error);
    return NextResponse.json({ error: "Unable to create campaign." }, { status: 500 });
  }
}
