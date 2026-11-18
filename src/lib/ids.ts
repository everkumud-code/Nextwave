import type { Prisma } from "@prisma/client";

/**
 * Identification numbers.
 *  - client:   BPML/<year of creation>/NR<serial>        e.g. BPML/2026/NR001   (the serial counts the clients created in that year)
 *  - campaign: <client number>/CP<serial>                e.g. BPML/2026/NR001/CP0007 (the serial counts the campaigns of that client)
 * Each serial is taken with one atomic statement, so two people signing up (or two campaigns created) at the same moment never get the same number.
 */
export function formatClientCode(year: number, serial: number): string {
  return `BPML/${year}/NR${String(serial).padStart(3, "0")}`;
}

export function formatCampaignCode(clientCode: string, serial: number): string {
  return `${clientCode}/CP${String(serial).padStart(4, "0")}`;
}

async function take(tx: Prisma.TransactionClient, key: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "IdCounter" ("key", "value") VALUES (${key}, 1)
    ON CONFLICT ("key") DO UPDATE SET "value" = "IdCounter"."value" + 1
    RETURNING "value"`;
  return Number(rows[0].value);
}

export async function nextClientCode(tx: Prisma.TransactionClient, now = new Date()): Promise<string> {
  const year = now.getFullYear();
  return formatClientCode(year, await take(tx, `client:${year}`));
}

export async function nextCampaignCode(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { clientCode: true } });
  if (!organization.clientCode) throw new Error("The client has no identification number.");
  return formatCampaignCode(organization.clientCode, await take(tx, `campaign:${organizationId}`));
}

export function formatInvoiceCode(clientCode: string, serial: number): string {
  return `${clientCode}/INV${String(serial).padStart(4, "0")}`;
}

/** The next invoice number of a client: <client number>/INV<serial>, for example BPML/2026/NR001/INV0003. */
export async function nextInvoiceCode(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
  const organization = await tx.organization.findUniqueOrThrow({ where: { id: organizationId }, select: { clientCode: true } });
  if (!organization.clientCode) throw new Error("The client has no identification number.");
  return formatInvoiceCode(organization.clientCode, await take(tx, `invoice:${organizationId}`));
}
