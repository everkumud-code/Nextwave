import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { groupId } = await route.params;
  const group = await prisma.contactGroup.findFirst({
    where: { id: groupId, organizationId: context.organization.id },
    select: {
      id: true, name: true, description: true, createdAt: true, updatedAt: true,
      members: {
        orderBy: { createdAt: "asc" },
        take: 5000,
        select: {
          contact: {
            select: { id: true, firstName: true, lastName: true, phoneNumberE164: true, email: true, company: true, status: true },
          },
        },
      },
      _count: { select: { members: true } },
    },
  });
  if (!group) return NextResponse.json({ error: "Contact group not found." }, { status: 404 });
  return NextResponse.json({ group: { ...group, contacts: group.members.map(member => member.contact), members: undefined } });
}

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to manage contact groups." }, { status: 403 });
  const { groupId } = await route.params;

  try {
    const body = await request.json();
    const existing = await prisma.contactGroup.findFirst({
      where: { id: groupId, organizationId: context.organization.id },
      select: { id: true },
    });
    if (!existing) return NextResponse.json({ error: "Contact group not found." }, { status: 404 });

    const data: { name?: string; description?: string | null } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Group name is required." }, { status: 400 });
      data.name = body.name.trim().slice(0, 80);
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") return NextResponse.json({ error: "Description must be text." }, { status: 400 });
      data.description = typeof body.description === "string" ? body.description.trim().slice(0, 500) || null : null;
    }

    let contactIds: string[] | undefined;
    if (body.contactIds !== undefined) {
      if (!Array.isArray(body.contactIds) || body.contactIds.length > 5000 || body.contactIds.some((id: unknown) => typeof id !== "string")) {
        return NextResponse.json({ error: "Select up to 5,000 contacts for this group." }, { status: 400 });
      }
      contactIds = [...new Set(body.contactIds as string[])];
      const ownedCount = contactIds.length ? await prisma.contact.count({
        where: { organizationId: context.organization.id, id: { in: contactIds } },
      }) : 0;
      if (ownedCount !== contactIds.length) return NextResponse.json({ error: "One or more contacts do not belong to this workspace." }, { status: 400 });
    }

    const group = await prisma.$transaction(async tx => {
      const updated = await tx.contactGroup.update({
        where: { id: existing.id },
        data,
        select: { id: true, name: true, description: true, updatedAt: true },
      });
      if (contactIds !== undefined) {
        await tx.contactGroupMember.deleteMany({ where: { groupId: existing.id } });
        if (contactIds.length) await tx.contactGroupMember.createMany({
          data: contactIds.map(contactId => ({ groupId: existing.id, contactId })),
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "contact_group.updated",
          resourceType: "ContactGroup",
          resourceId: existing.id,
          metadata: { fields: [...Object.keys(data), ...(contactIds !== undefined ? ["contactIds"] : [])], memberCount: contactIds?.length },
        },
      });
      return updated;
    });
    return NextResponse.json({ group });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "A group with this name already exists in this workspace." }, { status: 409 });
    }
    console.error("Contact group update failed", error);
    return NextResponse.json({ error: "Unable to update contact group." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to delete contact groups." }, { status: 403 });
  const { groupId } = await route.params;
  const existing = await prisma.contactGroup.findFirst({
    where: { id: groupId, organizationId: context.organization.id },
    select: { id: true, name: true },
  });
  if (!existing) return NextResponse.json({ error: "Contact group not found." }, { status: 404 });
  await prisma.$transaction(async tx => {
    await tx.contactGroup.delete({ where: { id: existing.id } });
    await tx.auditLog.create({
      data: {
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        action: "contact_group.deleted",
        resourceType: "ContactGroup",
        resourceId: existing.id,
        metadata: { name: existing.name },
      },
    });
  });
  return NextResponse.json({ deleted: true });
}
