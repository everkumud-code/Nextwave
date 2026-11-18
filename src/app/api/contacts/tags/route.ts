import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cleanTags } from "@/lib/tags";

export const runtime = "nodejs";

/** Every tag used in the workspace with the number of contacts that carry it. */
export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const rows = await prisma.$queryRaw<{ tag: string; count: bigint }[]>`
    SELECT t AS tag, count(*) AS count FROM "Contact", unnest("tags") AS t
    WHERE "organizationId" = ${context.organization.id}
    GROUP BY t ORDER BY count(*) DESC, t ASC LIMIT 300`;
  return NextResponse.json({ tags: rows.map(row => ({ tag: row.tag, count: Number(row.count) })) });
}

/** Add tags to, or remove tags from, up to 2,000 chosen contacts at once. */
export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to change contacts." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const ids: unknown = body?.ids;
  const add = cleanTags(body?.add, 10);
  const remove = cleanTags(body?.remove, 10);
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 2000 || ids.some(id => typeof id !== "string")) {
    return NextResponse.json({ error: "Choose between 1 and 2,000 contacts." }, { status: 400 });
  }
  if (!add.length && !remove.length) return NextResponse.json({ error: "Enter a tag to add or remove." }, { status: 400 });
  const organizationId = context.organization.id;
  const contactIds = [...new Set(ids as string[])];
  let changed = 0;
  if (add.length) {
    changed = await prisma.$executeRaw`
      UPDATE "Contact" SET "tags" = ARRAY(SELECT DISTINCT t FROM unnest("tags" || ${add}::text[]) AS t ORDER BY t), "updatedAt" = now()
      WHERE "organizationId" = ${organizationId} AND "id" = ANY(${contactIds}::text[])`;
  }
  if (remove.length) {
    changed = await prisma.$executeRaw`
      UPDATE "Contact" SET "tags" = ARRAY(SELECT t FROM unnest("tags") AS t WHERE t <> ALL(${remove}::text[])), "updatedAt" = now()
      WHERE "organizationId" = ${organizationId} AND "id" = ANY(${contactIds}::text[])`;
  }
  await prisma.auditLog.create({ data: { organizationId, actorUserId: context.user.id, action: "contact.tags_changed", resourceType: "Contact", metadata: { count: changed, add, remove } } });
  return NextResponse.json({ updated: changed });
}
