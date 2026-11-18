import { NextResponse } from "next/server";
import { getAuthContext, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ senderId: string }> };

/** The platform admin sets how many messages a number may send in a day (empty = the automatic warm-up schedule). */
export async function PATCH(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isPlatformAdminUser(context.user)) return NextResponse.json({ error: "Platform admin access required." }, { status: 403 });
  const { senderId } = await route.params;
  const body = await request.json().catch(() => ({}));
  const raw = body?.dailyLimit;
  const dailyLimit = raw === null || raw === "" || raw === undefined ? null : Number(raw);
  if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > 5000)) {
    return NextResponse.json({ error: "Enter a daily limit between 1 and 5,000, or leave it empty for the automatic schedule." }, { status: 400 });
  }
  const sender = await prisma.sender.findFirst({ where: { id: senderId, archivedAt: null }, select: { id: true, organizationId: true } });
  if (!sender) return NextResponse.json({ error: "Sender not found." }, { status: 404 });
  await prisma.$transaction([
    prisma.sender.update({ where: { id: sender.id }, data: { dailyLimitOverride: dailyLimit } }),
    prisma.auditLog.create({ data: { organizationId: sender.organizationId, actorUserId: context.user.id, action: "sender.daily_limit_set", resourceType: "Sender", resourceId: sender.id, metadata: { dailyLimit } } }),
  ]);
  return NextResponse.json({ dailyLimit });
}
