import type { Prisma } from "@prisma/client";
import { nextInvoiceCode } from "@/lib/ids";

/** Writes an invoice (receipt) for credit that was bought. Must run inside the same transaction that credits the wallet. */
export async function issueInvoice(
  tx: Prisma.TransactionClient,
  input: { organizationId: string; amountPaise: number; description: string; paymentOrderId?: string | null },
) {
  const invoiceNumber = await nextInvoiceCode(tx, input.organizationId);
  return tx.invoice.create({
    data: {
      organizationId: input.organizationId,
      invoiceNumber,
      amountPaise: input.amountPaise,
      description: input.description.slice(0, 240),
      paymentOrderId: input.paymentOrderId ?? null,
    },
    select: { id: true, invoiceNumber: true },
  });
}
