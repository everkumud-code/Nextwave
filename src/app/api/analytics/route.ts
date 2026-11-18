import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DailyStat = { day: Date; total: number; delivered: number; failed: number; read: number };

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const organizationId = context.organization.id;
  const since = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
  const [contacts, activeContacts, senders, connectedSenders, campaigns, messages, daily] = await Promise.all([
    prisma.contact.count({ where: { organizationId } }),
    prisma.contact.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.sender.count({ where: { organizationId, archivedAt: null } }),
    prisma.sender.count({ where: { organizationId, archivedAt: null, status: "CONNECTED" } }),
    prisma.campaign.groupBy({ by: ["status"], where: { organizationId }, _count: { _all: true } }),
    prisma.message.groupBy({ by: ["status"], where: { organizationId, kind: "CAMPAIGN" }, _count: { _all: true } }),
    prisma.$queryRaw<DailyStat[]>`
      SELECT date_trunc('day', "createdAt") AS day,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "status" = 'DELIVERED')::int AS delivered,
        COUNT(*) FILTER (WHERE "status" = 'FAILED')::int AS failed,
        COUNT(*) FILTER (WHERE "status" = 'READ')::int AS read
      FROM "Message"
      WHERE "organizationId" = ${organizationId} AND "kind" = 'CAMPAIGN' AND "createdAt" >= ${since}
      GROUP BY date_trunc('day', "createdAt")
      ORDER BY day ASC
    `,
  ]);

  const messageCounts = Object.fromEntries(messages.map(item => [item.status, item._count._all]));
  const campaignCounts = Object.fromEntries(campaigns.map(item => [item.status, item._count._all]));
  const totalMessages = messages.reduce((sum, item) => sum + item._count._all, 0);
  const delivered = messageCounts.DELIVERED ?? 0;
  const read = messageCounts.READ ?? 0;
  const failed = messageCounts.FAILED ?? 0;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    contacts: { total: contacts, active: activeContacts },
    senders: { total: senders, connected: connectedSenders },
    campaigns: { total: campaigns.reduce((sum, item) => sum + item._count._all, 0), byStatus: campaignCounts },
    messages: {
      total: totalMessages,
      byStatus: messageCounts,
      delivered,
      read,
      failed,
      deliveryRate: totalMessages ? Math.round(((delivered + read) / totalMessages) * 1000) / 10 : 0,
      failureRate: totalMessages ? Math.round((failed / totalMessages) * 1000) / 10 : 0,
    },
    daily: daily.map(item => ({
      day: item.day.toISOString().slice(0, 10),
      total: Number(item.total),
      delivered: Number(item.delivered),
      failed: Number(item.failed),
      read: Number(item.read),
    })),
  });
}
