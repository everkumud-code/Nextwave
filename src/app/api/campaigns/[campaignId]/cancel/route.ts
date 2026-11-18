import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

/**
 * Stops a campaign for good. The messages that have not gone out yet are cancelled and what was charged for them goes back
 * to the wallet (a CREDIT in the ledger). Messages already sent stay as they are.
 */
export async function POST(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to cancel campaigns." }, { status: 403 });
  const { campaignId } = await route.params;
  const organizationId = context.organization.id;

  const result = await prisma.$transaction(async tx => {
    const campaign = await tx.campaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true, status: true, campaignCode: true } });
    if (!campaign) return { error: "Campaign not found.", code: 404 };
    if (!["SCHEDULED", "QUEUED", "RUNNING", "PAUSED"].includes(campaign.status)) return { error: "Only a campaign that is scheduled, sending or paused can be cancelled.", code: 409 };

    const waiting = await tx.message.findMany({
      where: { organizationId, campaignId: campaign.id, status: "QUEUED", lockToken: null },
      select: { id: true, chargePaise: true },
    });
    let refundedPaise = 0;
    if (waiting.length) {
      const cancelled = await tx.message.updateMany({
        where: { id: { in: waiting.map(message => message.id) }, status: "QUEUED", lockToken: null },
        data: { status: "CANCELLED", errorCode: "CAMPAIGN_CANCELLED", errorMessage: "The campaign was cancelled before this message was sent.", lockedAt: null },
      });
      if (cancelled.count === waiting.length) refundedPaise = waiting.reduce((sum, message) => sum + message.chargePaise, 0);
      if (refundedPaise > 0) {
        const account = await tx.creditAccount.findUnique({ where: { organizationId } });
        if (account) {
          const updated = await tx.creditAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: refundedPaise } } });
          await tx.creditTransaction.create({
            data: {
              organizationId, accountId: account.id, type: "CREDIT", amountPaise: refundedPaise, balanceAfterPaise: updated.balancePaise,
              messageCount: waiting.length, reference: `campaign-cancel:${campaign.id}`, actorUserId: context.user.id,
              description: `Refund for ${waiting.length} message(s) not sent: campaign ${campaign.campaignCode ?? campaign.id} cancelled`,
            },
          });
        } else refundedPaise = 0;
      }
      await tx.campaignRecipient.updateMany({ where: { campaignId: campaign.id, status: { in: ["QUEUED", "PENDING"] } }, data: { status: "CANCELLED" } }).catch(() => undefined);
    }
    await tx.campaign.update({ where: { id: campaign.id }, data: { status: "CANCELLED", completedAt: new Date() } });
    await tx.auditLog.create({
      data: { organizationId, actorUserId: context.user.id, action: "campaign.cancelled", resourceType: "Campaign", resourceId: campaign.id, metadata: { cancelledMessages: waiting.length, refundedPaise } },
    });
    return { ok: true as const, cancelledMessages: waiting.length, refundedPaise };
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
  return NextResponse.json({ ...result, message: `Campaign cancelled. ${result.cancelledMessages} message(s) were not sent${result.refundedPaise ? ` and ${(result.refundedPaise / 100).toFixed(2)} rupees went back to your balance` : ""}.` });
}
