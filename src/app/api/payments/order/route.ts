import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { appUrl } from "@/lib/mailer";
import { MAX_PAYMENT_PAISE, MIN_PAYMENT_PAISE, formatAmount, payuConfig, requestHash } from "@/lib/payu";

export const runtime = "nodejs";

/**
 * Starts an online top-up: remembers the order and returns the signed fields the browser posts to PayU's payment page.
 * The amount is fixed here on the server and signed, so it cannot be changed in the browser.
 */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to buy credit." }, { status: 403 });
  const config = await payuConfig();
  if (!config) return NextResponse.json({ error: "Online payment is not switched on yet. Please ask the platform admin to add credit." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const rupees = Number(body?.amountRupees);
  const amountPaise = Math.round(rupees * 100);
  if (!Number.isFinite(rupees) || amountPaise < MIN_PAYMENT_PAISE || amountPaise > MAX_PAYMENT_PAISE) {
    return NextResponse.json({ error: `Enter an amount between Rs ${MIN_PAYMENT_PAISE / 100} and Rs ${MAX_PAYMENT_PAISE / 100}.` }, { status: 400 });
  }
  const order = await prisma.paymentOrder.create({ data: { organizationId: context.organization.id, amountPaise, provider: "PAYU", createdByUserId: context.user.id }, select: { id: true } });
  const txnid = order.id.slice(0, 25);
  await prisma.paymentOrder.update({ where: { id: order.id }, data: { providerOrderId: txnid } });
  const base = appUrl(request);
  const fields = {
    key: config.key, txnid, amount: formatAmount(amountPaise), productinfo: "Prepaid WhatsApp credit",
    firstname: (context.user.name?.trim().split(/\s+/)[0] || "Customer").replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 40) || "Customer",
    email: context.user.email,
  };
  return NextResponse.json({
    action: config.paymentUrl,
    fields: { ...fields, surl: `${base}/api/payments/payu/return`, furl: `${base}/api/payments/payu/return`, hash: requestHash(fields, config.salt) },
    mode: config.mode,
  });
}
