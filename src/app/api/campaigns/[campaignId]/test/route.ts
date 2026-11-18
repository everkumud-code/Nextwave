import { emailConfirmationMissing } from "@/lib/auth-tokens";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { mediaProblem } from "@/lib/media";
import { CONTENT_SELECT, campaignPin, campaignTemplate, contentProblem } from "@/lib/campaign-content";

import { findUnsupportedTemplateVariables, renderMessageTemplate } from "@/lib/message-template";
import { getCustomFieldKeys } from "@/lib/custom-fields";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

/**
 * Sends the campaign (text, file and all) to the sender's OWN number, so the owner sees exactly what a customer will see
 * ("Message yourself" chat). Free of charge, never to anyone else, at most 10 an hour. Delivered by the sending worker.
 */
export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (await emailConfirmationMissing(context.user)) return NextResponse.json({ error: "Please confirm your e-mail address first (we sent you a link). You can ask for a new one from the banner at the top of the dashboard." }, { status: 403 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to send test messages." }, { status: 403 });
  const { campaignId } = await route.params;
  const organizationId = context.organization.id;

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    select: {
      id: true, messageBody: true, mediaAssetId: true, ...CONTENT_SELECT, mediaAsset: { select: { kind: true } },
      sender: { select: { id: true, status: true, archivedAt: true, phoneNumberE164: true, displayName: true, connector: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (!campaign.sender || campaign.sender.archivedAt || campaign.sender.status !== "CONNECTED") {
    return NextResponse.json({ error: "Choose a connected sender first: the test goes to that sender's own number." }, { status: 409 });
  }
  if (campaign.sender.connector === "META_CLOUD_API") return NextResponse.json({ error: "A test to your own number is only for ordinary (QR) numbers. With an official number, send the template to a number that agreed to receive it." }, { status: 409 });
  const contentIssue = contentProblem(campaign, campaign.sender.connector);
  if (contentIssue) return NextResponse.json({ error: contentIssue }, { status: 400 });
  if (campaign.messageBody && findUnsupportedTemplateVariables(campaign.messageBody, await getCustomFieldKeys(organizationId)).length) return NextResponse.json({ error: "Fix the unsupported message variables first." }, { status: 400 });
  const problem = mediaProblem(campaign.mediaAsset?.kind, campaign.messageBody);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const recent = await prisma.message.count({ where: { organizationId, kind: "TEST", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= 10) return NextResponse.json({ error: "You have sent 10 test messages in the last hour. Try again a little later." }, { status: 429 });

  const own = campaign.sender.phoneNumberE164;
  const message = await prisma.message.create({
    data: {
      organizationId,
      campaignId: null,                    // a test never counts in a campaign's numbers or reports
      senderId: campaign.sender.id,
      recipientE164: own,
      body: renderMessageTemplate(campaign.messageBody ?? "", { firstName: "Test", lastName: "", company: "Your company", phoneNumber: own }),
      mediaAssetId: campaign.mediaAssetId,
      ...(campaignPin(campaign) ? { locationJson: { ...campaignPin(campaign)! } } : {}),
      kind: "TEST",
      status: "QUEUED",
      idempotencyKey: `test:${campaign.id}:${randomUUID()}`,
      chargePaise: 0,
      nextAttemptAt: new Date(),
    },
    select: { id: true },
  });
  await prisma.auditLog.create({
    data: { organizationId, actorUserId: context.user.id, action: "campaign.test_sent", resourceType: "Campaign", resourceId: campaign.id, metadata: { messageId: message.id, senderId: campaign.sender.id } },
  });
  return NextResponse.json({ message: { id: message.id }, to: own, note: "The test goes to the sender's own number (the 'Message yourself' chat) within a few seconds, while the sending worker is on." }, { status: 202 });
}
