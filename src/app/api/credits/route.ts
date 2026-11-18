import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const account = await prisma.creditAccount.upsert({
    where: { organizationId: context.organization.id },
    create: { organizationId: context.organization.id },
    update: {},
    select: { id: true, balancePaise: true, pricePerMessagePaise: true, defaultIntervalSeconds: true, updatedAt: true },
  });
  const transactions = await prisma.creditTransaction.findMany({
    where: { organizationId: context.organization.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, type: true, amountPaise: true, balanceAfterPaise: true, pricePerMessagePaise: true, messageCount: true, description: true, createdAt: true },
  });

  return NextResponse.json({
    clientCode: context.organization.clientCode ?? null,
    account: { ...account, balanceRupees: account.balancePaise / 100, pricePerMessageRupees: account.pricePerMessagePaise / 100 },
    transactions,
  });
}
