import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const [eligible, total, withdrawn, inactive] = await Promise.all([
    prisma.contact.count({
      where: {
        organizationId: context.organization.id,
        status: "ACTIVE",
        consents: { some: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED" } },
      },
    }),
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
    eligible,
    total,
    suppressed: total - eligible,
    withdrawnOrUnsubscribed: withdrawn,
    inactiveOrBlocked: inactive,
    rule: "Only ACTIVE contacts whose latest WhatsApp MARKETING consent is GRANTED are included.",
  });
}
