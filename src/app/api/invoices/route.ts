import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const invoices = await prisma.invoice.findMany({
    where: { organizationId: context.organization.id },
    orderBy: { issuedAt: "desc" },
    take: 200,
    select: { id: true, invoiceNumber: true, amountPaise: true, description: true, issuedAt: true },
  });
  return NextResponse.json({ invoices });
}
