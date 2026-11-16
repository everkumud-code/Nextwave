import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

type RouteContext = { params: Promise<{ senderId: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to manage senders." }, { status: 403 });

  const { senderId } = await route.params;
  const existing = await prisma.sender.findFirst({
    where: { id: senderId, organizationId: context.organization.id, archivedAt: null },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Sender not found." }, { status: 404 });

  try {
    const body = await request.json();
    const data: { displayName?: string; assignedLabel?: string | null } = {};
    if (typeof body.displayName === "string") {
      const displayName = body.displayName.trim().slice(0, 80);
      if (!displayName) return NextResponse.json({ error: "Sender name cannot be empty." }, { status: 400 });
      data.displayName = displayName;
    }
    if (body.assignedLabel === null || typeof body.assignedLabel === "string") {
      data.assignedLabel = typeof body.assignedLabel === "string" ? body.assignedLabel.trim().slice(0, 80) || null : null;
    }
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "No supported fields provided." }, { status: 400 });

    const sender = await prisma.$transaction(async (tx) => {
      const updated = await tx.sender.update({
        where: { id: senderId },
        data,
        select: {
          id: true, displayName: true, phoneNumber: true, phoneNumberE164: true,
          ownership: true, connector: true, status: true, assignedLabel: true,
          lastConnectedAt: true, lastSeenAt: true, createdAt: true,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "sender.updated",
          resourceType: "Sender",
          resourceId: senderId,
          metadata: data,
        },
      });
      return updated;
    });
    return NextResponse.json({ sender });
  } catch (error) {
    console.error("Sender update failed", error);
    return NextResponse.json({ error: "Unable to update sender." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to manage senders." }, { status: 403 });

  const { senderId } = await route.params;
  const existing = await prisma.sender.findFirst({
    where: { id: senderId, organizationId: context.organization.id, archivedAt: null },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Sender not found." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.sender.update({
      where: { id: senderId },
      data: { archivedAt: new Date(), status: "ARCHIVED" },
    });
    await tx.auditLog.create({
      data: {
        organizationId: context.organization.id,
        actorUserId: context.user.id,
        action: "sender.archived",
        resourceType: "Sender",
        resourceId: senderId,
      },
    });
  });
  return NextResponse.json({ ok: true });
}
