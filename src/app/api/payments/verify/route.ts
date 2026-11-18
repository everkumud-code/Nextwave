import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { razorpayConfig, settlePaymentOrder, verifyPaymentSignature } from "@/lib/razorpay";

export const runtime = "nodejs";

/** The browser reports a finished payment; credit is added only when the gateway's signature proves it is real. */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const config = razorpayConfig();
  if (!config) return NextResponse.json({ error: "Online payment is not switched on." }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const orderId = typeof body?.orderId === "string" ? body.orderId : "";
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId : "";
  const signature = typeof body?.signature === "string" ? body.signature : "";
  if (!orderId || !paymentId || !signature) return NextResponse.json({ error: "Payment details are missing." }, { status: 400 });
  const order = await prisma.paymentOrder.findFirst({ where: { providerOrderId: orderId, organizationId: context.organization.id }, select: { id: true } });
  if (!order) return NextResponse.json({ error: "Payment order not found." }, { status: 404 });
  if (!verifyPaymentSignature(orderId, paymentId, signature, config.keySecret)) return NextResponse.json({ error: "The payment could not be verified." }, { status: 400 });
  const outcome = await settlePaymentOrder(orderId, paymentId);
  return NextResponse.json({ ok: true, invoiceNumber: outcome.invoiceNumber ?? null });
}
