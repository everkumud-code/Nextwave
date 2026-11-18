import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { isValidEmail, normalizePhoneNumber } from "@/lib/contacts";
import { cleanTags } from "@/lib/tags";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ contactId: string }> };

const text = (value: unknown, max: number): string | null | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  return value.trim().slice(0, max) || null;
};

/** Fix a contact: name, e-mail, company or phone number (the new number must not already be in this workspace). */
export async function PATCH(request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to edit contacts." }, { status: 403 });
  const { contactId } = await route.params;
  const organizationId = context.organization.id;
  const existing = await prisma.contact.findFirst({ where: { id: contactId, organizationId }, select: { id: true, phoneNumberE164: true } });
  if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });

  try {
    const body = await request.json();
    const data: { firstName?: string | null; lastName?: string | null; email?: string | null; company?: string | null; phoneNumber?: string; phoneNumberE164?: string; tags?: string[] } = {};
    for (const [key, max] of [["firstName", 80], ["lastName", 80], ["email", 254], ["company", 120]] as const) {
      const value = text(body[key], max);
      if (value !== undefined) data[key] = value;
    }
    if (data.email && !isValidEmail(data.email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (body.phoneNumber !== undefined) {
      if (typeof body.phoneNumber !== "string") return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
      const phone = normalizePhoneNumber(body.phoneNumber);
      if (!phone) return NextResponse.json({ error: "Enter a valid phone number. Indian 10-digit mobile numbers and international numbers with +country code are supported." }, { status: 400 });
      if (phone.e164 !== existing.phoneNumberE164) {
        const clash = await prisma.contact.findFirst({ where: { organizationId, phoneNumberE164: phone.e164, id: { not: existing.id } }, select: { id: true } });
        if (clash) return NextResponse.json({ error: "This phone number already exists in your workspace." }, { status: 409 });
        const waiting = await prisma.message.count({ where: { organizationId, recipientE164: existing.phoneNumberE164, status: "QUEUED" } });
        if (waiting) return NextResponse.json({ error: "A message is still waiting for this number. Change the number after the campaign has finished or been paused and cleared." }, { status: 409 });
      }
      data.phoneNumber = body.phoneNumber.trim();
      data.phoneNumberE164 = phone.e164;
    }
    if (body.tags !== undefined) data.tags = cleanTags(body.tags);
    if (!Object.keys(data).length) return NextResponse.json({ error: "Nothing to change." }, { status: 400 });

    const contact = await prisma.$transaction(async tx => {
      const updated = await tx.contact.update({
        where: { id: existing.id },
        data,
        select: { id: true, firstName: true, lastName: true, phoneNumber: true, phoneNumberE164: true, email: true, company: true, tags: true, status: true },
      });
      await tx.auditLog.create({
        data: { organizationId, actorUserId: context.user.id, action: "contact.updated", resourceType: "Contact", resourceId: existing.id, metadata: { fields: Object.keys(data) } },
      });
      return updated;
    });
    return NextResponse.json({ contact });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") return NextResponse.json({ error: "This phone number already exists in your workspace." }, { status: 409 });
    console.error("Contact update failed", error);
    return NextResponse.json({ error: "Unable to update the contact." }, { status: 500 });
  }
}

/** Remove a contact (and its consent records). Refused while a message for the number is still waiting to be sent. */
export async function DELETE(_request: Request, route: RouteContext) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to delete contacts." }, { status: 403 });
  const { contactId } = await route.params;
  const organizationId = context.organization.id;
  const existing = await prisma.contact.findFirst({ where: { id: contactId, organizationId }, select: { id: true, phoneNumberE164: true } });
  if (!existing) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const waiting = await prisma.message.count({ where: { organizationId, recipientE164: existing.phoneNumberE164, status: "QUEUED" } });
  if (waiting) return NextResponse.json({ error: "A message is still waiting for this contact. Wait until the campaign has finished, or pause it, first." }, { status: 409 });
  await prisma.$transaction([
    prisma.contact.delete({ where: { id: existing.id } }),
    prisma.auditLog.create({ data: { organizationId, actorUserId: context.user.id, action: "contact.deleted", resourceType: "Contact", resourceId: existing.id } }),
  ]);
  return NextResponse.json({ deleted: true });
}
