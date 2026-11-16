import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cleanOptionalText } from "@/lib/contacts";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ contactId: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const { contactId } = await route.params;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId: context.organization.id },
    select: { id: true },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  const records = await prisma.consentRecord.findMany({
    where: { contactId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, channel: true, purpose: true, status: true, source: true,
      evidenceRef: true, noticeVersion: true, grantedAt: true, withdrawnAt: true, createdAt: true,
    },
  });
  return NextResponse.json({ consents: records });
}

export async function POST(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to change consent records." }, { status: 403 });

  const { contactId } = await route.params;
  const contact = await prisma.contact.findFirst({
    where: { id: contactId, organizationId: context.organization.id },
    select: { id: true, status: true },
  });
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  try {
    const body = await request.json();
    const channel = typeof body.channel === "string" ? body.channel.trim().toUpperCase() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim().toUpperCase() : "";
    const status = body.status;
    if (!["WHATSAPP", "SMS", "EMAIL"].includes(channel) || !["MARKETING", "TRANSACTIONAL", "SERVICE"].includes(purpose) || !["GRANTED", "WITHDRAWN", "UNKNOWN"].includes(status)) {
      return NextResponse.json({ error: "Provide a supported channel, purpose and consent status." }, { status: 400 });
    }

    const record = await prisma.$transaction(async (tx) => {
      const created = await tx.consentRecord.create({
        data: {
          contactId,
          channel,
          purpose,
          status,
          source: cleanOptionalText(body.source, 80) ?? "MANUAL",
          evidenceRef: cleanOptionalText(body.evidenceRef, 500),
          noticeVersion: cleanOptionalText(body.noticeVersion, 80),
          grantedAt: status === "GRANTED" ? new Date() : null,
          withdrawnAt: status === "WITHDRAWN" ? new Date() : null,
        },
      });
      if (channel === "WHATSAPP" && purpose === "MARKETING" && status === "WITHDRAWN") {
        await tx.contact.updateMany({
          where: { id: contactId, organizationId: context.organization.id },
          data: { status: "UNSUBSCRIBED" },
        });
      }
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "contact.consent_recorded",
          resourceType: "Contact",
          resourceId: contactId,
          metadata: { channel, purpose, status, consentRecordId: created.id },
        },
      });
      return created;
    });
    return NextResponse.json({ consent: record }, { status: 201 });
  } catch (error) {
    console.error("Consent recording failed", error);
    return NextResponse.json({ error: "Unable to record consent." }, { status: 500 });
  }
}
