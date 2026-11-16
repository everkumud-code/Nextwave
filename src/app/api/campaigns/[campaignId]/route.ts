import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ campaignId: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { campaignId } = await route.params;
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organization.id },
    select: {
      id: true, name: true, description: true, status: true, channel: true,
      createdAt: true, updatedAt: true,
      sender: { select: { id: true, displayName: true, phoneNumberE164: true, status: true } },
      recipients: {
        orderBy: { createdAt: "asc" },
        take: 100,
        select: {
          id: true, status: true, createdAt: true,
          contact: { select: { id: true, firstName: true, lastName: true, phoneNumberE164: true, status: true } },
        },
      },
      _count: { select: { recipients: true, messages: true } },
    },
  });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to edit campaigns." }, { status: 403 });
  const { campaignId } = await route.params;
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId: context.organization.id },
    select: { id: true, status: true },
  });
  if (!existing) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (existing.status !== "DRAFT") return NextResponse.json({ error: "Only draft campaigns can be edited." }, { status: 409 });

  try {
    const body = await request.json();
    const data: { name?: string; description?: string | null; senderId?: string | null } = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });
      data.name = body.name.trim().slice(0, 120);
    }
    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== "string") return NextResponse.json({ error: "Description must be text." }, { status: 400 });
      data.description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null;
    }
    if (body.senderId !== undefined) {
      if (body.senderId === null || body.senderId === "") data.senderId = null;
      else if (typeof body.senderId === "string") {
        const sender = await prisma.sender.findFirst({
          where: { id: body.senderId, organizationId: context.organization.id, archivedAt: null, status: "CONNECTED" },
          select: { id: true },
        });
        if (!sender) return NextResponse.json({ error: "Select a connected sender from this workspace." }, { status: 400 });
        data.senderId = sender.id;
      } else return NextResponse.json({ error: "Invalid sender." }, { status: 400 });
    }
    const campaign = await prisma.$transaction(async tx => {
      const updated = await tx.campaign.update({
        where: { id: existing.id },
        data,
        select: { id: true, name: true, description: true, status: true, senderId: true, updatedAt: true },
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "campaign.updated",
          resourceType: "Campaign",
          resourceId: existing.id,
          metadata: { fields: Object.keys(data) },
        },
      });
      return updated;
    });
    return NextResponse.json({ campaign });
  } catch (error) {
    console.error("Campaign update failed", error);
    return NextResponse.json({ error: "Unable to update campaign." }, { status: 500 });
  }
}
