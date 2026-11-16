import { prisma } from "@/lib/db/prisma";

export type ConsentSnapshot = { status: "GRANTED" | "WITHDRAWN" | "UNKNOWN" };

export function hasCurrentMarketingConsent(records: ConsentSnapshot[]): boolean {
  return records[0]?.status === "GRANTED";
}

export async function getEligibleWhatsAppMarketingContactIds(organizationId: string, limit = 5001) {
  const candidates = await prisma.contact.findMany({
    where: {
      organizationId,
      status: "ACTIVE",
      consents: { some: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED" } },
    },
    select: {
      id: true,
      consents: {
        where: { channel: "WHATSAPP", purpose: "MARKETING" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 1,
        select: { status: true },
      },
    },
    take: limit,
  });
  return candidates.filter(contact => hasCurrentMarketingConsent(contact.consents)).map(contact => contact.id);
}
