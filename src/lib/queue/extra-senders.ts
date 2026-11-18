import type { Prisma } from "@prisma/client";

/** The extra senders of a campaign that are still connected and belong to the workspace (a disconnected one is left out). */
export async function usableExtraSenderIds(tx: Prisma.TransactionClient, organizationId: string, mainSenderId: string, extraSenderIds: string[]): Promise<string[]> {
  const wanted = [...new Set(extraSenderIds)].filter(id => id !== mainSenderId).slice(0, 9);
  if (!wanted.length) return [];
  const rows = await tx.sender.findMany({ where: { id: { in: wanted }, organizationId, archivedAt: null, status: "CONNECTED" }, select: { id: true } });
  const ok = new Set(rows.map(row => row.id));
  return wanted.filter(id => ok.has(id));
}
