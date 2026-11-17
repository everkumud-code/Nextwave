import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const connectors = ["QR_SESSION", "META_CLOUD_API", "OTHER"] as const;
const ownerships = ["CUSTOMER", "PLATFORM"] as const;

function normalizeE164(value: string) {
  const compact = value.replace(/[\s().-]/g, "");
  return /^\+[1-9]\d{7,14}$/.test(compact) ? compact : null;
}

export async function GET() {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const senders = await prisma.sender.findMany({
    where: { organizationId: context.organization.id, archivedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, displayName: true, phoneNumber: true, phoneNumberE164: true,
      ownership: true, connector: true, status: true, assignedLabel: true,
      lastConnectedAt: true, lastSeenAt: true, createdAt: true,
    },
  });
  return NextResponse.json({ senders });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to manage senders." }, { status: 403 });

  try {
    const body = await request.json();
    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 80) : "";
    const phoneNumber = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
    const phoneNumberE164 = normalizeE164(phoneNumber);
    const connector = body.connector;
    const ownership = body.ownership ?? "CUSTOMER";

    if (!displayName || !phoneNumberE164 || !connectors.includes(connector) || !ownerships.includes(ownership)) {
      return NextResponse.json({ error: "Provide a sender name, a valid E.164 phone number (including +country code), connector and ownership." }, { status: 400 });
    }

    const sender = await prisma.$transaction(async (tx) => {
      const created = await tx.sender.create({
        data: {
          organizationId: context.organization.id,
          displayName,
          phoneNumber,
          phoneNumberE164,
          connector,
          ownership,
        },
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
          action: "sender.created",
          resourceType: "Sender",
          resourceId: created.id,
          metadata: { connector, ownership },
        },
      });
      return created;
    });
    return NextResponse.json({ sender }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "This phone number is already registered in the workspace." }, { status: 409 });
    }
    console.error("Sender creation failed", error);
    return NextResponse.json({ error: "Unable to create sender." }, { status: 500 });
  }
}
