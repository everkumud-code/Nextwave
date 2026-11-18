import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { MAX_PAYMENT_PAISE, MIN_PAYMENT_PAISE, payuConfig } from "@/lib/payu";

export const runtime = "nodejs";

/** Tells the billing page whether online payment (PayU) is switched on: only when the merchant key and salt are set. */
export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const config = await payuConfig();
  return NextResponse.json({ enabled: Boolean(config), provider: "PayU", mode: config?.mode ?? null, minRupees: MIN_PAYMENT_PAISE / 100, maxRupees: MAX_PAYMENT_PAISE / 100 });
}
