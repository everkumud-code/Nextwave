import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getEligibleWhatsAppMarketingContactIds } from "@/lib/campaign-audience";
import { findUnsupportedTemplateVariables } from "@/lib/message-template";
import { getCustomFieldKeys } from "@/lib/custom-fields";
import { mediaProblem } from "@/lib/media";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to validate campaigns." }, { status: 403 });

  const { campaignId } = await route.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organization.id },
    select: {
      id: true, status: true, name: true, messageBody: true, senderId: true, scheduledAt: true, mediaAssetId: true, mediaAsset: { select: { kind: true } },
      sender: { select: { organizationId: true, status: true, archivedAt: true } },
      recipients: { select: { contactId: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.status !== "DRAFT") return NextResponse.json({ error: "Only draft campaigns can be validated." }, { status: 409 });

  const issues: string[] = [];
  if (!campaign.name.trim()) issues.push("Campaign name is missing.");
  const mediaIssue = mediaProblem(campaign.mediaAsset?.kind, campaign.messageBody);
  if (mediaIssue) issues.push(mediaIssue);
  if (!campaign.messageBody?.trim() && !campaign.mediaAssetId) issues.push("Add a message, or attach a picture, video, audio file or PDF.");
  else if (campaign.messageBody?.trim()) {
    const unsupported = findUnsupportedTemplateVariables(campaign.messageBody, await getCustomFieldKeys(context.organization.id));
    if (unsupported.length) issues.push(`Unsupported message variables: ${unsupported.join(", ")}.`);
  }
  if (!campaign.senderId || !campaign.sender || campaign.sender.organizationId !== context.organization.id || campaign.sender.archivedAt) issues.push("Assign an active sender from this workspace.");
  else if (campaign.sender.status !== "CONNECTED") issues.push("The assigned sender is not connected.");
  if (campaign.recipients.length === 0) issues.push("Select at least one recipient.");

  const selectedIds = campaign.recipients.map(recipient => recipient.contactId);
  const eligibleIds = selectedIds.length
    ? await getEligibleWhatsAppMarketingContactIds(context.organization.id, 100000)
    : [];
  const eligible = new Set(eligibleIds);
  const eligibleSelected = selectedIds.filter(id => eligible.has(id)).length;
  const suppressed = selectedIds.length - eligibleSelected;
  if (suppressed) issues.push(`${suppressed} selected recipient(s) no longer meet the current consent and contact-status rules.`);
  if (selectedIds.length > 50000) issues.push("Campaign exceeds the 50,000-recipient planning limit.");

  const ready = issues.length === 0;
  await prisma.auditLog.create({
    data: {
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      action: "campaign.validated",
      resourceType: "Campaign",
      resourceId: campaign.id,
      metadata: { ready, recipientCount: selectedIds.length, eligibleRecipientCount: eligibleSelected, issueCount: issues.length },
    },
  });

  return NextResponse.json({
    ready,
    issues,
    checks: {
      hasMessage: Boolean(campaign.messageBody?.trim()),
      senderConnected: campaign.sender?.status === "CONNECTED" && !campaign.sender.archivedAt && campaign.sender.organizationId === context.organization.id,
      selectedRecipients: selectedIds.length,
      currentlyEligibleRecipients: eligibleSelected,
      suppressedRecipients: suppressed,
    },
  });
}
