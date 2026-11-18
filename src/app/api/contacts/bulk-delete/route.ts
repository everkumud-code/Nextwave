import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

/** Delete up to 500 chosen contacts at once. Those with a message still waiting are kept and reported. */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to delete contacts." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500 || ids.some(id => typeof id !== "string")) {
    return NextResponse.json({ error: "Choose between 1 and 500 contacts." }, { status: 400 });
  }
  const organizationId = context.organization.id;
  const chosen = await prisma.contact.findMany({ where: { organizationId, id: { in: [...new Set(ids as string[])] } }, select: { id: true, phoneNumberE164: true } });
  const waiting = await prisma.message.findMany({
    where: { organizationId, status: "QUEUED", recipientE164: { in: chosen.map(contact => contact.phoneNumberE164) } },
    select: { recipientE164: true },
    distinct: ["recipientE164"],
  });
  const busy = new Set(waiting.map(message => message.recipientE164));
  const deletable = chosen.filter(contact => !busy.has(contact.phoneNumberE164));
  if (deletable.length) {
    await prisma.$transaction([
      prisma.contact.deleteMany({ where: { organizationId, id: { in: deletable.map(contact => contact.id) } } }),
      prisma.auditLog.create({ data: { organizationId, actorUserId: context.user.id, action: "contact.bulk_deleted", resourceType: "Contact", metadata: { count: deletable.length, skippedWaiting: chosen.length - deletable.length } } }),
    ]);
  }
  return NextResponse.json({ deleted: deletable.length, skippedBecauseMessagesAreWaiting: chosen.length - deletable.length, notFound: new Set(ids as string[]).size - chosen.length });
}
