import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { formatAmount, payuConfig, settlePaymentOrder, verifyWithPayu } from "@/lib/payu";

export const runtime = "nodejs";

/**
 * A customer may pay and then close the browser before PayU sends them back. This asks PayU about this client's
 * open orders of the last two days and adds the credit for those that were really paid. Safe to call any time.
 */
export async function POST() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const config = await payuConfig();
  if (!config) return NextResponse.json({ checked: 0, settled: 0 });
  const open = await prisma.paymentOrder.findMany({
    where: { organizationId: context.organization.id, provider: "PAYU", status: "CREATED", providerOrderId: { not: null }, createdAt: { gte: new Date(Date.now() - 2 * 24 * 3600_000), lte: new Date(Date.now() - 60_000) } },
    take: 10, orderBy: { createdAt: "desc" }, select: { providerOrderId: true, amountPaise: true },
  });
  let settled = 0;
  for (const order of open) {
    const proof = await verifyWithPayu(config, order.providerOrderId!);
    if (proof.confirmed === true && proof.mihpayid && (!proof.amount || Number(proof.amount).toFixed(2) === formatAmount(order.amountPaise))) {
      if ((await settlePaymentOrder(order.providerOrderId!, proof.mihpayid)).settled) settled++;
    }
  }
  return NextResponse.json({ checked: open.length, settled });
}
