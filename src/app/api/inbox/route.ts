import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
const PAGE = 50;

/** Replies that customers sent to the workspace's numbers, newest first. ?unread=1 shows only the unread ones; ?count=1 only the unread number. */
export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const organizationId = context.organization.id;
  const url = new URL(request.url);
  if (url.searchParams.get("count") === "1") {
    return NextResponse.json({ unread: await prisma.inboundMessage.count({ where: { organizationId, readAt: null } }) });
  }
  const unreadOnly = url.searchParams.get("unread") === "1";
  const cursor = url.searchParams.get("cursor");
  const where = { organizationId, ...(unreadOnly ? { readAt: null } : {}) };
  const [rows, unread, total] = await Promise.all([
    prisma.inboundMessage.findMany({
      where,
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: PAGE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true, fromE164: true, body: true, isOptOut: true, readAt: true, receivedAt: true,
        contact: { select: { id: true, firstName: true, lastName: true } },
        sender: { select: { displayName: true, phoneNumberE164: true } },
      },
    }),
    prisma.inboundMessage.count({ where: { organizationId, readAt: null } }),
    prisma.inboundMessage.count({ where }),
  ]);
  const hasMore = rows.length > PAGE;
  const page = hasMore ? rows.slice(0, PAGE) : rows;
  return NextResponse.json({ replies: page, unread, total, nextCursor: hasMore ? page[page.length - 1].id : null });
}
