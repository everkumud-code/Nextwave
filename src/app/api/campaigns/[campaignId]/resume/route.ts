import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

/** Resumes a paused campaign. The messages that are still waiting are spaced out again from now, so that a pause never ends in a burst. */
export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to resume campaigns." }, { status: 403 });
  const { campaignId } = await route.params;
  const organizationId = context.organization.id;

  const result = await prisma.$transaction(async tx => {
    const campaign = await tx.campaign.findFirst({
      where: { id: campaignId, organizationId },
      select: { id: true, status: true, senderId: true, sender: { select: { status: true, archivedAt: true } } },
    });
    if (!campaign) return { error: "Campaign not found.", code: 404 };
    if (campaign.status !== "PAUSED") return { error: "Only paused campaigns can be resumed.", code: 409 };
    if (!campaign.senderId || !campaign.sender || campaign.sender.status !== "CONNECTED" || campaign.sender.archivedAt) {
      return { error: "Reconnect the assigned sender before resuming.", code: 409 };
    }
    const account = await tx.creditAccount.findUnique({ where: { organizationId }, select: { defaultIntervalSeconds: true } });
    const intervalSeconds = Math.max(10, Math.min(90, account?.defaultIntervalSeconds || 60));
    await tx.$executeRaw(Prisma.sql`
      UPDATE "Message" AS m
      SET "nextAttemptAt" = NOW() + (ordered.position - 1) * ${intervalSeconds}::int * INTERVAL '1 second',
          "updatedAt" = NOW()
      FROM (
        SELECT "id", ROW_NUMBER() OVER (ORDER BY "nextAttemptAt" ASC, "createdAt" ASC) AS position
        FROM "Message"
        WHERE "organizationId" = ${organizationId} AND "campaignId" = ${campaign.id} AND "status" = 'QUEUED'
      ) AS ordered
      WHERE m."id" = ordered."id"
    `);
    await tx.campaign.update({ where: { id: campaign.id }, data: { status: "QUEUED" } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: context.user.id,
        action: "campaign.resumed",
        resourceType: "Campaign",
        resourceId: campaign.id,
        metadata: { intervalSeconds },
      },
    });
    return { ok: true as const, campaignId: campaign.id, status: "QUEUED" as const };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json({ result, message: "Campaign resumed. Waiting messages are spaced out again from now." });
}
