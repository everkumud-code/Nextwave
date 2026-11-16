import { NextResponse } from "next/server";
import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isPlatformAdminUser(context.user)) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });

  const organizations = await prisma.organization.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, slug: true,
      creditAccount: { select: { balancePaise: true, pricePerMessagePaise: true } },
      senders: {
        where: { archivedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, displayName: true, phoneNumberE164: true, status: true, provider: true },
      },
      _count: { select: { contacts: true, campaigns: true, messages: true } },
    },
  });
  return NextResponse.json({ organizations });
}
