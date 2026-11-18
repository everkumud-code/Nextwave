import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { MAX_PAYMENT_PAISE, MIN_PAYMENT_PAISE, createRazorpayOrder, razorpayConfig } from "@/lib/razorpay";

export const runtime = "nodejs";

/** Starts an online top-up: remembers the order and asks the gateway for a payment order the browser can pay. */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to buy credit." }, { status: 403 });
  const config = razorpayConfig();
  if (!config) return NextResponse.json({ error: "Online payment is not switched on yet. Please ask the platform admin to add credit." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const rupees = Number(body?.amountRupees);
  const amountPaise = Math.round(rupees * 100);
  if (!Number.isFinite(rupees) || amountPaise < MIN_PAYMENT_PAISE || amountPaise > MAX_PAYMENT_PAISE) {
    return NextResponse.json({ error: `Enter an amount between Rs ${MIN_PAYMENT_PAISE / 100} and Rs ${MAX_PAYMENT_PAISE / 100}.` }, { status: 400 });
  }
  const organizationId = context.organization.id;
  const order = await prisma.paymentOrder.create({ data: { organizationId, amountPaise, createdByUserId: context.user.id }, select: { id: true } });
  try {
    const remote = await createRazorpayOrder(config, amountPaise, `nw_${order.id}`);
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { providerOrderId: remote.id } });
    return NextResponse.json({ orderId: remote.id, amountPaise, keyId: config.keyId, name: context.organization.name, email: context.user.email });
  } catch (error) {
    await prisma.paymentOrder.update({ where: { id: order.id }, data: { status: "FAILED" } }).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to start the payment." }, { status: 502 });
  }
}
