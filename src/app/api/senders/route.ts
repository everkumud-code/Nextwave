import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { GraphRequestError, getPhoneInfo, mapGraphError } from "@/lib/connectors/meta-cloud/graph";
import { encryptSecret, secretBoxAvailable } from "@/lib/secret-box";

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

    // an official (Meta Cloud API) number: the three values from Meta's WhatsApp setup page
    let official: { phoneNumberId: string; wabaId: string; token: string } | null = null;
    if (connector === "META_CLOUD_API") {
      const phoneNumberId = typeof body.phoneNumberId === "string" ? body.phoneNumberId.trim() : "";
      const wabaId = typeof body.wabaId === "string" ? body.wabaId.trim() : "";
      const token = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
      if (!/^\d{6,25}$/.test(phoneNumberId) || !/^\d{6,25}$/.test(wabaId) || token.length < 20 || token.length > 1000) {
        return NextResponse.json({ error: "For an official number, enter the Phone number ID, the WhatsApp Business Account ID (both are numbers) and the access token from Meta." }, { status: 400 });
      }
      if (!secretBoxAvailable()) return NextResponse.json({ error: "The server has no encryption key, so the token cannot be stored safely." }, { status: 503 });
      if (await prisma.sender.findFirst({ where: { connector: "META_CLOUD_API", providerAccountRef: phoneNumberId, archivedAt: null }, select: { id: true } })) {
        return NextResponse.json({ error: "This phone number ID is already added." }, { status: 409 });
      }
      try {
        const info = await getPhoneInfo(token, phoneNumberId);
        const shown = info.displayPhoneNumber.replace(/\D/g, "");
        if (shown && shown !== phoneNumberE164.slice(1)) {
          return NextResponse.json({ error: `Meta says this phone number ID belongs to ${info.displayPhoneNumber}, not ${phoneNumber}. Check the number.` }, { status: 400 });
        }
      } catch (error) {
        const message = error instanceof GraphRequestError ? mapGraphError(error.detail).errorMessage : "Meta could not be reached.";
        return NextResponse.json({ error: `Meta did not accept these details: ${message}` }, { status: 400 });
      }
      official = { phoneNumberId, wabaId, token };
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
          ...(official ? { status: "CONNECTED" as const, providerAccountRef: official.phoneNumberId, lastConnectedAt: new Date(), providerCredential: { create: { organizationId: context.organization.id, wabaId: official.wabaId, accessTokenEnc: encryptSecret(official.token) } } } : {}),
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
