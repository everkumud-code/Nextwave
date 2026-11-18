import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { getEligibleWhatsAppMarketingContactIds } from "@/lib/campaign-audience";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const [eligibleIds, total, withdrawn, inactive] = await Promise.all([
    getEligibleWhatsAppMarketingContactIds(context.organization.id, 100000),
    prisma.contact.count({ where: { organizationId: context.organization.id } }),
    prisma.contact.count({ where: { organizationId: context.organization.id, status: "UNSUBSCRIBED" } }),
    prisma.contact.count({ where: { organizationId: context.organization.id, status: { in: ["INVALID", "BLOCKED"] } } }),
  ]);

  const includeContacts = new URL(request.url).searchParams.get("includeContacts") === "1";
  const contacts = includeContacts && eligibleIds.length
    ? await prisma.contact.findMany({
        where: { organizationId: context.organization.id, id: { in: eligibleIds.slice(0, 50000) } },
        select: { id: true, phoneNumberE164: true, firstName: true, lastName: true, email: true, company: true, tags: true },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 50000,
      })
    : undefined;

  return NextResponse.json({
    ...(contacts ? { contacts } : {}),
    eligible: eligibleIds.length,
    total,
    suppressed: total - eligibleIds.length,
    withdrawnOrUnsubscribed: withdrawn,
    inactiveOrBlocked: inactive,
    rule: "Only ACTIVE contacts whose latest WhatsApp MARKETING consent is GRANTED are included.",
  });
}
