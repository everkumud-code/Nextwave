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
        select: { id: true, displayName: true, phoneNumberE164: true, status: true, connector: true },
      },
      _count: { select: { contacts: true, campaigns: true } },
    },
  });
  // Message has no relation to Organization in the schema (organizationId is a plain column), so its count is read separately
  const messageCounts = await prisma.message.groupBy({
    by: ["organizationId"],
    where: { organizationId: { in: organizations.map((o) => o.id) } },
    _count: { _all: true },
  });
  const byOrg = new Map(messageCounts.map((m) => [m.organizationId, m._count._all]));
  return NextResponse.json({
    organizations: organizations.map((o) => ({ ...o, _count: { ...o._count, messages: byOrg.get(o.id) ?? 0 } })),
  });
}
