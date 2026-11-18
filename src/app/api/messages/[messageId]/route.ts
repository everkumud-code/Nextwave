import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ messageId: string }> };

/** The state of one message of this workspace (used to follow a test message). */
export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { messageId } = await route.params;
  const message = await prisma.message.findFirst({
    where: { id: messageId, organizationId: context.organization.id },
    select: { id: true, status: true, kind: true, errorCode: true, errorMessage: true, submittedAt: true, deliveredAt: true, readAt: true },
  });
  if (!message) return NextResponse.json({ error: "Message not found." }, { status: 404 });
  return NextResponse.json({ message });
}
