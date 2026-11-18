import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { issueInvoice } from "@/lib/invoices";

/** One online payment buys between these amounts (in paise). */
export const MIN_PAYMENT_PAISE = 10_000;        // Rs 100
export const MAX_PAYMENT_PAISE = 20_000_000;    // Rs 2,00,000

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string | null };

/** Online payment works only when the owner has put the Razorpay keys in the server settings. */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null };
}

function safeEqualHex(expected: string, given: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(given, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Razorpay signs "order_id|payment_id" with the key secret; a payment is trusted only when this matches. */
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string, keySecret: string): boolean {
  const expected = createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string, webhookSecret: string): boolean {
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}

export async function createRazorpayOrder(config: RazorpayConfig, amountPaise: number, receipt: string): Promise<{ id: string }> {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}` },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40) }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await response.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!response.ok || !data.id) throw new Error(data.error?.description || "The payment gateway did not accept the order.");
  return { id: data.id };
}

/**
 * Marks a payment order as paid exactly once: credits the wallet, writes the ledger line and issues the invoice.
 * Called by the browser after checkout AND by the gateway's own webhook; whichever comes second finds it already done.
 */
export async function settlePaymentOrder(providerOrderId: string, providerPaymentId: string): Promise<{ settled: boolean; invoiceNumber?: string; organizationId?: string }> {
  return prisma.$transaction(async tx => {
    const order = await tx.paymentOrder.findUnique({ where: { providerOrderId }, include: { invoice: { select: { invoiceNumber: true } } } });
    if (!order) return { settled: false };
    if (order.status === "PAID") return { settled: false, invoiceNumber: order.invoice?.invoiceNumber, organizationId: order.organizationId };
    const claimed = await tx.paymentOrder.updateMany({ where: { id: order.id, status: { not: "PAID" } }, data: { status: "PAID", paidAt: new Date(), providerPaymentId } });
    if (!claimed.count) return { settled: false, organizationId: order.organizationId };
    const account = await tx.creditAccount.upsert({ where: { organizationId: order.organizationId }, create: { organizationId: order.organizationId }, update: {} });
    const updated = await tx.creditAccount.update({ where: { id: account.id }, data: { balancePaise: { increment: order.amountPaise } } });
    await tx.creditTransaction.create({
      data: {
        organizationId: order.organizationId, accountId: account.id, type: "CREDIT", amountPaise: order.amountPaise,
        balanceAfterPaise: updated.balancePaise, reference: `payment:${providerPaymentId}`,
        description: `Online payment ${providerPaymentId}`, actorUserId: order.createdByUserId,
      },
    });
    const invoice = await issueInvoice(tx, { organizationId: order.organizationId, amountPaise: order.amountPaise, description: `Prepaid WhatsApp credit (online payment ${providerPaymentId})`, paymentOrderId: order.id });
    await tx.auditLog.create({
      data: { organizationId: order.organizationId, actorUserId: order.createdByUserId, action: "payment.settled", resourceType: "PaymentOrder", resourceId: order.id, metadata: { amountPaise: order.amountPaise, providerPaymentId, invoice: invoice.invoiceNumber } },
    });
    return { settled: true, invoiceNumber: invoice.invoiceNumber, organizationId: order.organizationId };
  }, { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 });
}
