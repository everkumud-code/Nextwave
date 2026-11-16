import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { campaignId } = await route.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organization.id },
    select: { id: true, status: true },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });

  const url = new URL(request.url);
  const pageValue = Number(url.searchParams.get("page") ?? "1");
  const page = Number.isInteger(pageValue) ? Math.max(1, Math.min(pageValue, 10000)) : 1;
  const pageSize = 50;
  const where = { organizationId: context.organization.id, campaignId };
  const [groups, total, messages] = await Promise.all([
    prisma.message.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.message.count({ where }),
    prisma.message.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, recipientE164: true, status: true, attemptCount: true, maxAttempts: true,
        errorCode: true, errorMessage: true, submittedAt: true, deliveredAt: true, readAt: true, createdAt: true,
      },
    }),
  ]);

  const counts = Object.fromEntries(groups.map(group => [group.status, group._count._all]));
  return NextResponse.json({
    campaign,
    counts: {
      total,
      queued: counts.QUEUED ?? 0,
      submitted: counts.SUBMITTED ?? 0,
      sent: counts.SENT ?? 0,
      delivered: counts.DELIVERED ?? 0,
      read: counts.READ ?? 0,
      failed: counts.FAILED ?? 0,
      cancelled: counts.CANCELLED ?? 0,
    },
    messages,
    page,
    pageSize,
    hasMore: page * pageSize < total,
  });
}
