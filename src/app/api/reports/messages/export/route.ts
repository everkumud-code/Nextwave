import { NextResponse } from "next/server";
import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { MessageStatus } from "@prisma/client";

export const runtime = "nodejs";
const statuses = new Set(Object.values(MessageStatus));

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const url = new URL(request.url);
  const requestedOrganizationId = url.searchParams.get("organizationId");
  if (requestedOrganizationId && !isPlatformAdminUser(context.user)) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });
  const organizationId = requestedOrganizationId || context.organization.id;
  const statusParam = url.searchParams.get("status");
  const campaignId = url.searchParams.get("campaignId") || undefined;
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())) || (statusParam && !statuses.has(statusParam as MessageStatus))) {
    return NextResponse.json({ error: "Invalid report filter." }, { status: 400 });
  }
  const messages = await prisma.message.findMany({
    where: {
      organizationId,
      ...(statusParam ? { status: statusParam as MessageStatus } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50000,
    select: {
      recipientE164: true, body: true, status: true, chargePaise: true,
      createdAt: true, submittedAt: true, deliveredAt: true, readAt: true,
      providerMessageId: true, errorCode: true, errorMessage: true,
      campaign: { select: { name: true } },
      sender: { select: { displayName: true, phoneNumberE164: true } },
    },
  });
  const header = ["campaign","sender_name","sender_phone","recipient_phone","message","status","charge_paise","created_at","submitted_at","delivered_at","read_at","provider_message_id","error_code","error_message"];
  const rows = messages.map(m => [
    m.campaign?.name,m.sender?.displayName,m.sender?.phoneNumberE164,m.recipientE164,m.body,m.status,m.chargePaise,
    m.createdAt.toISOString(),m.submittedAt?.toISOString(),m.deliveredAt?.toISOString(),m.readAt?.toISOString(),
    m.providerMessageId,m.errorCode,m.errorMessage,
  ].map(csvCell).join(","));
  return new Response([header.map(csvCell).join(","), ...rows].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="nextwave-message-report.csv"',
      "Cache-Control": "no-store",
    },
  });
}
