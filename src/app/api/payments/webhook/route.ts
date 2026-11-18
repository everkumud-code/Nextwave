import { NextResponse } from "next/server";
import { razorpayConfig, settlePaymentOrder, verifyWebhookSignature } from "@/lib/razorpay";

export const runtime = "nodejs";

/** The gateway tells us about a payment even when the customer closed the browser before it finished. Signed with the webhook secret. */
export async function POST(request: Request) {
  const config = razorpayConfig();
  if (!config?.webhookSecret) return NextResponse.json({ error: "Webhook is not configured." }, { status: 503 });
  const raw = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!signature || !verifyWebhookSignature(raw, signature, config.webhookSecret)) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; status?: string } } } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid body." }, { status: 400 }); }
  const payment = event.payload?.payment?.entity;
  if ((event.event === "payment.captured" || event.event === "order.paid") && payment?.id && payment.order_id) {
    await settlePaymentOrder(payment.order_id, payment.id);
  }
  return NextResponse.json({ ok: true });
}
