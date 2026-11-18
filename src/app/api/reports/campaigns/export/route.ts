import { NextResponse } from "next/server";
import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { parseFormat, tableResponse } from "@/lib/table-output";

export const runtime = "nodejs";

const cell = (value: unknown) => `"${(value === null || value === undefined ? "" : String(value)).replace(/"/g, '""')}"`;
const pct = (part: number, whole: number) => (whole ? (Math.round((part / whole) * 1000) / 10).toString() : "0");

/** One row per campaign: how many were sent, delivered, read and failed, with the rates, and what it cost. Opens in Excel. */
export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const requested = url.searchParams.get("organizationId");
  if (requested && !isPlatformAdminUser(context.user)) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });
  const organizationId = requested || context.organization.id;
  const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : undefined;
  const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) return NextResponse.json({ error: "Invalid date." }, { status: 400 });

  const campaigns = await prisma.campaign.findMany({
    where: { organizationId, ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true, campaignCode: true, name: true, status: true, createdAt: true, scheduledAt: true, startedAt: true, completedAt: true, mediaAsset: { select: { kind: true } },
      sender: { select: { displayName: true, phoneNumberE164: true } }, _count: { select: { recipients: true } },
    },
  });
  const ids = campaigns.map(campaign => campaign.id);
  const [counts, charges] = await Promise.all([
    prisma.message.groupBy({ by: ["campaignId", "status"], where: { organizationId, campaignId: { in: ids }, kind: "CAMPAIGN" }, _count: { _all: true } }),
    prisma.message.groupBy({ by: ["campaignId"], where: { organizationId, campaignId: { in: ids }, kind: "CAMPAIGN" }, _sum: { chargePaise: true } }),
  ]);
  const byCampaign = new Map<string, Record<string, number>>();
  for (const row of counts) {
    if (!row.campaignId) continue;
    const entry = byCampaign.get(row.campaignId) ?? {};
    entry[row.status] = row._count._all;
    byCampaign.set(row.campaignId, entry);
  }
  const charged = new Map(charges.map(row => [row.campaignId, row._sum.chargePaise ?? 0]));

  const client = await prisma.organization.findUnique({ where: { id: organizationId }, select: { clientCode: true } });
  const header = ["client_id", "campaign_id", "campaign", "status", "sender", "sender_phone", "file", "recipients", "messages", "queued", "submitted", "sent", "delivered", "read", "failed", "cancelled",
    "delivered_percent", "read_percent", "failed_percent", "charged_paise", "created_at", "scheduled_at", "started_at", "completed_at"];
  const rows = campaigns.map(campaign => {
    const c = byCampaign.get(campaign.id) ?? {};
    const total = Object.values(c).reduce((sum, n) => sum + n, 0);
    const reached = (c.DELIVERED ?? 0) + (c.READ ?? 0);          // a message that was read was delivered first
    return [
      client?.clientCode, campaign.campaignCode, campaign.name, campaign.status, campaign.sender?.displayName, campaign.sender?.phoneNumberE164, campaign.mediaAsset?.kind ?? "", campaign._count.recipients, total,
      c.QUEUED ?? 0, c.SUBMITTED ?? 0, c.SENT ?? 0, c.DELIVERED ?? 0, c.READ ?? 0, c.FAILED ?? 0, c.CANCELLED ?? 0,
      pct(reached, total), pct(c.READ ?? 0, total), pct(c.FAILED ?? 0, total), charged.get(campaign.id) ?? 0,
      campaign.createdAt.toISOString(), campaign.scheduledAt?.toISOString(), campaign.startedAt?.toISOString(), campaign.completedAt?.toISOString(),
    ];
  });
  const format = parseFormat(url.searchParams.get("format"));
  if (format !== "csv") {
    // the PDF keeps: campaign id, name, status, recipients, delivered / read / failed counts and rates
    return tableResponse({ format, fileBase: "nextwave-campaign-summary", title: "Campaign summary", header, rows, pdfColumns: [1, 2, 3, 7, 8, 12, 13, 14, 16, 17, 18, 19] });
  }
  return new Response("﻿" + [header.map(cell).join(","), ...rows.map(row => row.map(cell).join(","))].join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="nextwave-campaign-summary.csv"', "Cache-Control": "no-store" },
  });
}
