import type { Prisma } from "@prisma/client";

type ReceiptTransaction = Prisma.TransactionClient;

const allowedFrom = {
  SENT: ["QUEUED", "SUBMITTED"],
  DELIVERED: ["QUEUED", "SUBMITTED", "SENT"],
  READ: ["QUEUED", "SUBMITTED", "SENT", "DELIVERED"],
  FAILED: ["QUEUED", "SUBMITTED", "SENT"],
} as const;

export async function applyPendingProviderReceipts(
  tx: ReceiptTransaction,
  input: { organizationId: string; senderId: string; providerMessageId: string },
) {
  const message = await tx.message.findFirst({
    where: {
      organizationId: input.organizationId,
      senderId: input.senderId,
      providerMessageId: input.providerMessageId,
    },
    select: { id: true },
  });
  if (!message) return { applied: 0, pending: true };

  const receipts = await tx.providerDeliveryReceipt.findMany({
    where: {
      organizationId: input.organizationId,
      senderId: input.senderId,
      providerMessageId: input.providerMessageId,
      appliedAt: null,
    },
    orderBy: [{ eventTimestamp: "asc" }, { receivedAt: "asc" }],
  });
  let applied = 0;
  for (const receipt of receipts) {
    const updated = await tx.message.updateMany({
      where: {
        id: message.id,
        status: { in: [...allowedFrom[receipt.status]] },
      },
      data: {
        status: receipt.status,
        ...(receipt.status === "SENT" ? { submittedAt: receipt.eventTimestamp } : {}),
        ...(receipt.status === "DELIVERED" ? { deliveredAt: receipt.eventTimestamp } : {}),
        ...(receipt.status === "READ" ? { readAt: receipt.eventTimestamp } : {}),
        ...(receipt.status === "FAILED" ? {
          errorCode: receipt.errorCode ?? "PROVIDER_DELIVERY_FAILED",
          errorMessage: receipt.errorMessage ?? "The provider reported message delivery failure.",
        } : {}),
      },
    });
    await tx.providerDeliveryReceipt.update({
      where: { id: receipt.id },
      data: { appliedAt: new Date() },
    });
    if (updated.count) applied++;
  }
  return { applied, pending: false };
}
