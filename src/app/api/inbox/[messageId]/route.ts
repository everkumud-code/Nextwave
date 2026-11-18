import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ messageId: string }> };

/** Mark one reply as read (or unread, with {"read": false}). */
export async function PATCH(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { messageId } = await route.params;
  const body = await request.json().catch(() => ({}));
  const read = body?.read !== false;
  const changed = await prisma.inboundMessage.updateMany({ where: { id: messageId, organizationId: context.organization.id }, data: { readAt: read ? new Date() : null } });
  if (!changed.count) return NextResponse.json({ error: "Reply not found." }, { status: 404 });
  return NextResponse.json({ read });
}
