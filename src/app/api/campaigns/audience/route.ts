import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getEligibleWhatsAppMarketingContactIds } from "@/lib/campaign-audience";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const [eligibleIds, total, withdrawn, inactive] = await Promise.all([
    getEligibleWhatsAppMarketingContactIds(context.organization.id, 100000),
    prisma.contact.count({ where: { organizationId: context.organization.id } }),
    prisma.contact.count({
      where: {
        organizationId: context.organization.id,
        OR: [
          { status: "UNSUBSCRIBED" },
          { consents: { some: { channel: "WHATSAPP", purpose: "MARKETING", status: "WITHDRAWN" } } },
        ],
      },
    }),
    prisma.contact.count({
      where: { organizationId: context.organization.id, status: { in: ["INVALID", "BLOCKED"] } },
    }),
  ]);
  return NextResponse.json({
    eligible: eligibleIds.length,
    total,
    suppressed: total - eligibleIds.length,
    withdrawnOrUnsubscribed: withdrawn,
    inactiveOrBlocked: inactive,
    rule: "Only ACTIVE contacts whose latest WhatsApp MARKETING consent is GRANTED are included.",
  });
}
