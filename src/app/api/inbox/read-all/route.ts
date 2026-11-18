import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function POST() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const changed = await prisma.inboundMessage.updateMany({ where: { organizationId: context.organization.id, readAt: null }, data: { readAt: new Date() } });
  return NextResponse.json({ marked: changed.count });
}
