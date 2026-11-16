import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const groups = await prisma.contactGroup.findMany({
    where: { organizationId: context.organization.id },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    select: {
      id: true, name: true, description: true, createdAt: true, updatedAt: true,
      _count: { select: { members: true } },
    },
  });
  return NextResponse.json({ groups });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to manage contact groups." }, { status: 403 });

  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
    if (!name) return NextResponse.json({ error: "Group name is required." }, { status: 400 });
    if (!Array.isArray(body.contactIds) || body.contactIds.length > 5000 || body.contactIds.some((id: unknown) => typeof id !== "string")) {
      return NextResponse.json({ error: "Select up to 5,000 contacts for this group." }, { status: 400 });
    }
    const contactIds = [...new Set(body.contactIds as string[])];
    const ownedCount = contactIds.length ? await prisma.contact.count({
      where: { organizationId: context.organization.id, id: { in: contactIds } },
    }) : 0;
    if (ownedCount !== contactIds.length) return NextResponse.json({ error: "One or more contacts do not belong to this workspace." }, { status: 400 });

    const group = await prisma.$transaction(async tx => {
      const created = await tx.contactGroup.create({
        data: {
          organizationId: context.organization.id,
          name,
          description,
          ...(contactIds.length ? { members: { create: contactIds.map(contactId => ({ contactId })) } } : {}),
        },
        select: { id: true, name: true, description: true, createdAt: true, updatedAt: true, _count: { select: { members: true } } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "contact_group.created",
          resourceType: "ContactGroup",
          resourceId: created.id,
          metadata: { memberCount: contactIds.length },
        },
      });
      return created;
    });
    return NextResponse.json({ group }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "A group with this name already exists in this workspace." }, { status: 409 });
    }
    console.error("Contact group creation failed", error);
    return NextResponse.json({ error: "Unable to create contact group." }, { status: 500 });
  }
}
