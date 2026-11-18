import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

/** Reasons that retrying cannot fix (the person withdrew consent, bad data): those messages stay failed. */
const NOT_RETRYABLE = ["CONSENT_REVOKED", "CONSENT_WITHDRAWN", "INVALID_MESSAGE", "INVALID_RECIPIENT"];

/**
 * Sends the failed messages of a campaign again. They were already paid for when the campaign was queued, so nothing is charged
 * a second time; they are spaced out again from now, one after another.
 */
export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to resend messages." }, { status: 403 });
  const { campaignId } = await route.params;
  const organizationId = context.organization.id;

  const result = await prisma.$transaction(async tx => {
    const campaign = await tx.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { id: true, status: true, senderId: true, sender: { select: { status: true, archivedAt: true } } },
    });
    if (!campaign) return { error: "Campaign not found.", code: 404 };
    if (["DRAFT", "SCHEDULED", "CANCELLED"].includes(campaign.status)) return { error: "This campaign has not been sent yet.", code: 409 };
    if (campaign.status === "PAUSED") return { error: "Resume the paused campaign first.", code: 409 };
    if (!campaign.senderId || !campaign.sender || campaign.sender.status !== "CONNECTED" || campaign.sender.archivedAt) return { error: "Reconnect the assigned sender before resending.", code: 409 };
    const account = await tx.creditAccount.findUnique({ where: { organizationId }, select: { defaultIntervalSeconds: true } });
    const intervalSeconds = Math.max(10, Math.min(90, account?.defaultIntervalSeconds || 60));
    const count = await tx.$executeRaw(Prisma.sql`
      UPDATE "Message" AS m
      SET "status" = 'QUEUED', "attemptCount" = 0, "errorCode" = NULL, "errorMessage" = NULL, "lockedAt" = NULL, "lockToken" = NULL,
          "nextAttemptAt" = NOW() + (ordered.position - 1) * ${intervalSeconds}::int * INTERVAL '1 second', "updatedAt" = NOW()
      FROM (
        SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt" ASC) AS position
        FROM "Message"
        WHERE "organizationId" = ${organizationId} AND "campaignId" = ${campaign.id} AND "status" = 'FAILED'
          AND COALESCE("errorCode", '') NOT IN (${Prisma.join(NOT_RETRYABLE)})
      ) AS ordered
      WHERE m."id" = ordered."id"
    `);
    if (count === 0) return { error: "There are no failed messages that can be sent again.", code: 409 };
    await tx.campaignRecipient.updateMany({ where: { campaignId: campaign.id, status: "FAILED" }, data: { status: "QUEUED" } });
    await tx.campaign.update({ where: { id: campaign.id }, data: { status: "QUEUED", completedAt: null } });
    await tx.auditLog.create({
      data: { organizationId, actorUserId: context.user.id, action: "campaign.failed_resent", resourceType: "Campaign", resourceId: campaign.id, metadata: { messages: count, intervalSeconds } },
    });
    return { ok: true as const, resent: count };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json({ resent: result.resent, message: `${result.resent} failed message(s) are being sent again, one after another.` });
}
