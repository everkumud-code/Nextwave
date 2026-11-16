import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
const campaignSelect = {
  id: true, name: true, description: true, status: true, channel: true,
  scheduledAt: true, createdAt: true, updatedAt: true,
  sender: { select: { id: true, displayName: true, phoneNumberE164: true, status: true } },
  _count: { select: { recipients: true, messages: true } },
} as const;

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const [campaigns, eligibleAudience] = await Promise.all([
    prisma.campaign.findMany({
      where: { organizationId: context.organization.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: campaignSelect,
    }),
    prisma.contact.count({
      where: {
        organizationId: context.organization.id,
        status: "ACTIVE",
        consents: { some: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED" } },
      },
    }),
  ]);
  return NextResponse.json({ campaigns, eligibleAudience });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to create campaigns." }, { status: 403 });

  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) || null : null;
    const senderId = typeof body.senderId === "string" && body.senderId ? body.senderId : null;
    if (!name) return NextResponse.json({ error: "Campaign name is required." }, { status: 400 });

    if (senderId) {
      const sender = await prisma.sender.findFirst({
        where: { id: senderId, organizationId: context.organization.id, archivedAt: null },
        select: { id: true, status: true },
      });
      if (!sender) return NextResponse.json({ error: "Sender not found in this workspace." }, { status: 404 });
      if (sender.status !== "CONNECTED") return NextResponse.json({ error: "Select a connected sender to assign this campaign." }, { status: 409 });
    }

    const eligible = await prisma.contact.findMany({
      where: {
        organizationId: context.organization.id,
        status: "ACTIVE",
        consents: { some: { channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED" } },
      },
      select: {
        id: true,
        consents: {
          where: { channel: "WHATSAPP", purpose: "MARKETING" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true },
        },
      },
      take: 5001,
    });
    const eligibleIds = eligible.filter(contact => contact.consents[0]?.status === "GRANTED").map(contact => contact.id);
    if (eligibleIds.length > 5000) return NextResponse.json({ error: "Audience exceeds the 5,000-recipient campaign planning limit." }, { status: 400 });

    const campaign = await prisma.$transaction(async tx => {
      const created = await tx.campaign.create({
        data: {
          organizationId: context.organization.id,
          name,
          description,
          senderId,
          status: "DRAFT",
          channel: "WHATSAPP",
          recipients: { create: eligibleIds.map(contactId => ({ contactId, status: "PENDING" })) },
        },
        select: campaignSelect,
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "campaign.created",
          resourceType: "Campaign",
          resourceId: created.id,
          metadata: { recipientCount: eligibleIds.length, senderId, channel: "WHATSAPP" },
        },
      });
      return created;
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error("Campaign creation failed", error);
    return NextResponse.json({ error: "Unable to create campaign." }, { status: 500 });
  }
}
