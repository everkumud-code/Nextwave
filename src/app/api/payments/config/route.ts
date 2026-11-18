import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { MAX_PAYMENT_PAISE, MIN_PAYMENT_PAISE, razorpayConfig } from "@/lib/razorpay";

export const runtime = "nodejs";

/** Tells the billing page whether online payment is switched on (it is only when the Razorpay keys are in the server settings). */
export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const config = razorpayConfig();
  return NextResponse.json({ enabled: Boolean(config), keyId: config?.keyId ?? null, minRupees: MIN_PAYMENT_PAISE / 100, maxRupees: MAX_PAYMENT_PAISE / 100 });
}
