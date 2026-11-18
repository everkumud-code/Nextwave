import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { issueInvoice } from "@/lib/invoices";
import { getSettings } from "@/lib/platform-settings";

/** One online payment buys between these amounts (in paise). */
export const MIN_PAYMENT_PAISE = 10_000;        // Rs 100
export const MAX_PAYMENT_PAISE = 20_000_000;    // Rs 2,00,000

export type PayuConfig = { key: string; salt: string; mode: "test" | "live"; paymentUrl: string; apiUrl: string };

/** Online payment works only when the merchant key and salt are set (on the settings screen or in the server environment). */
export async function payuConfig(): Promise<PayuConfig | null> {
  const s = await getSettings(["payu.key", "payu.salt", "payu.mode"]);
  const key = s["payu.key"];
  const salt = s["payu.salt"];
  if (!key || !salt) return null;
  const mode = s["payu.mode"]?.toLowerCase() === "live" ? "live" : "test";
  const config: PayuConfig = mode === "live"
    ? { key, salt, mode, paymentUrl: "https://secure.payu.in/_payment", apiUrl: "https://info.payu.in/merchant/postservice.php?form=2" }
    : { key, salt, mode, paymentUrl: "https://test.payu.in/_payment", apiUrl: "https://test.payu.in/merchant/postservice.php?form=2" };
  // for tests only: point the status check at a local stand-in
  if (process.env.PAYU_API_URL?.trim() && process.env.PAYU_TEST_HOOKS === "1") config.apiUrl = process.env.PAYU_API_URL.trim();
  return config;
}

const sha512 = (text: string) => createHash("sha512").update(text, "utf8").digest("hex");

function sameHex(a: string, b: string): boolean {
  const left = Buffer.from(a.toLowerCase(), "utf8");
  const right = Buffer.from(b.toLowerCase(), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export type PayuRequestFields = { key: string; txnid: string; amount: string; productinfo: string; firstname: string; email: string; udf1?: string; udf2?: string; udf3?: string; udf4?: string; udf5?: string };

/** PayU wants the amount as text with two decimals: "500.00". */
export function formatAmount(paise: number): string {
  return (paise / 100).toFixed(2);
}

/** sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt) */
export function requestHash(fields: PayuRequestFields, salt: string): string {
  return sha512([fields.key, fields.txnid, fields.amount, fields.productinfo, fields.firstname, fields.email, fields.udf1 ?? "", fields.udf2 ?? "", fields.udf3 ?? "", fields.udf4 ?? "", fields.udf5 ?? "", "", "", "", "", "", salt].join("|"));
}

export type PayuResponseFields = { status?: string; txnid?: string; amount?: string; productinfo?: string; firstname?: string; email?: string; key?: string; mihpayid?: string; hash?: string; additionalCharges?: string; udf1?: string; udf2?: string; udf3?: string; udf4?: string; udf5?: string };

/** sha512([additionalCharges|]salt|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key): what PayU signs on the way back. */
export function responseHash(fields: PayuResponseFields, salt: string): string {
  const parts = [salt, fields.status ?? "", "", "", "", "", "", fields.udf5 ?? "", fields.udf4 ?? "", fields.udf3 ?? "", fields.udf2 ?? "", fields.udf1 ?? "", fields.email ?? "", fields.firstname ?? "", fields.productinfo ?? "", fields.amount ?? "", fields.txnid ?? "", fields.key ?? ""];
  if (fields.additionalCharges) parts.unshift(fields.additionalCharges);
  return sha512(parts.join("|"));
}

export function responseHashIsValid(fields: PayuResponseFields, salt: string): boolean {
  return Boolean(fields.hash) && sameHex(responseHash(fields, salt), fields.hash!);
}

/** Asks PayU itself whether a transaction was paid (a second proof besides the signed reply). confirmed is null when PayU cannot be reached. */
export async function verifyWithPayu(config: PayuConfig, txnid: string): Promise<{ confirmed: boolean | null; mihpayid?: string; amount?: string }> {
  try {
    const hash = sha512([config.key, "verify_payment", txnid, config.salt].join("|"));
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key: config.key, command: "verify_payment", var1: txnid, hash }).toString(),
      signal: AbortSignal.timeout(12_000),
    });
    const data = await response.json() as { status?: number; transaction_details?: Record<string, { status?: string; mihpayid?: string | number; amt?: string; transaction_amount?: string }> };
    const detail = data.transaction_details?.[txnid];
    if (!detail) return { confirmed: data.status === 1 ? false : null };
    return { confirmed: detail.status === "success", mihpayid: detail.mihpayid === undefined ? undefined : String(detail.mihpayid), amount: detail.transaction_amount ?? detail.amt };
  } catch {
    return { confirmed: null };
  }
}

/**
 * Marks a payment order as paid exactly once: credits the wallet, writes the ledger line and issues the invoice.
 * Called when PayU sends the customer back AND by the reconcile check; whichever comes second finds it already done.
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
