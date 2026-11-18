import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { appUrl } from "@/lib/mailer";
import { formatAmount, payuConfig, responseHashIsValid, settlePaymentOrder, verifyWithPayu, type PayuResponseFields } from "@/lib/payu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function back(request: Request, result: string, invoice?: string | null) {
  const url = new URL("/billing", appUrl(request));
  url.searchParams.set("payment", result);
  if (invoice) url.searchParams.set("invoice", invoice);
  return NextResponse.redirect(url, 303);
}

/**
 * PayU sends the customer's browser here after the payment page (success or failure) with a signed form.
 * Nothing is trusted until the signature matches; a "success" is also checked with PayU itself before credit is added.
 */
export async function POST(request: Request) {
  const config = await payuConfig();
  if (!config) return back(request, "unavailable");
  const form = await request.formData().catch(() => null);
  if (!form) return back(request, "invalid");
  const reply: PayuResponseFields = {};
  for (const name of ["status", "txnid", "amount", "productinfo", "firstname", "email", "key", "mihpayid", "hash", "additionalCharges", "udf1", "udf2", "udf3", "udf4", "udf5"] as const) {
    const value = form.get(name);
    if (typeof value === "string") reply[name] = value;
  }
  if (!reply.txnid || !responseHashIsValid(reply, config.salt) || reply.key !== config.key) return back(request, "invalid");
  const order = await prisma.paymentOrder.findUnique({ where: { providerOrderId: reply.txnid }, select: { id: true, amountPaise: true, status: true, invoice: { select: { invoiceNumber: true } } } });
  if (!order) return back(request, "invalid");
  if (order.status === "PAID") return back(request, "success", order.invoice?.invoiceNumber);
  if (reply.status?.toLowerCase() !== "success") {
    await prisma.paymentOrder.updateMany({ where: { id: order.id, status: "CREATED" }, data: { status: "FAILED" } });
    return back(request, "failed");
  }
  // the signed amount must be exactly what this order asked for
  if (reply.amount !== formatAmount(order.amountPaise)) return back(request, "invalid");
  const proof = await verifyWithPayu(config, reply.txnid);
  // PayU does not (yet) confirm it: the order stays open and is credited later by the reconcile check once PayU does
  if (proof.confirmed === false) return back(request, "pending");
  const outcome = await settlePaymentOrder(reply.txnid, reply.mihpayid || reply.txnid);
  return back(request, "success", outcome.invoiceNumber);
}

/** Someone opened the return address by hand: send them to the billing page. */
export async function GET(request: Request) {
  return back(request, "none");
}
