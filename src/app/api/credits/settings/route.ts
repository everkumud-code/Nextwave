import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
const allowedIntervals = new Set([10, 20, 30, 40, 50, 60, 70, 80, 90]);

export async function PATCH(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!["OWNER", "ADMIN", "MANAGER"].includes(context.role)) {
    return NextResponse.json({ error: "You do not have permission to change sending preferences." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const interval = Number(body.defaultIntervalSeconds);
  if (!allowedIntervals.has(interval)) {
    return NextResponse.json({ error: "Choose an interval from 10 to 90 seconds in 10-second steps." }, { status: 400 });
  }

  const account = await prisma.creditAccount.upsert({
    where: { organizationId: context.organization.id },
    create: { organizationId: context.organization.id, defaultIntervalSeconds: interval },
    update: { defaultIntervalSeconds: interval },
    select: { defaultIntervalSeconds: true, updatedAt: true },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: context.organization.id,
      actorUserId: context.user.id,
      action: "credits.sending_interval_updated",
      resourceType: "CreditAccount",
      metadata: { defaultIntervalSeconds: interval },
    },
  });
  return NextResponse.json({ account });
}
