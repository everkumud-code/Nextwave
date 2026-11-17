import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { cleanOptionalText, isValidEmail, normalizePhoneNumber } from "@/lib/contacts";

export const runtime = "nodejs";

const PAGE_SIZE = 50;
const contactSelect = {
  id: true, phoneNumber: true, phoneNumberE164: true, firstName: true,
  lastName: true, email: true, company: true, customFields: true,
  status: true, source: true, createdAt: true, updatedAt: true,
  consents: { take: 1, orderBy: { createdAt: "desc" as const }, select: { channel: true, purpose: true, status: true, createdAt: true } },
} as const;

export async function GET(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const status = url.searchParams.get("status");
  const cursor = url.searchParams.get("cursor");
  const where = {
    organizationId: context.organization.id,
    ...(status && ["ACTIVE", "UNSUBSCRIBED", "INVALID", "BLOCKED"].includes(status) ? { status: status as "ACTIVE" | "UNSUBSCRIBED" | "INVALID" | "BLOCKED" } : {}),
    ...(query ? {
      OR: [
        { phoneNumberE164: { contains: query.replace(/\s/g, "") } },
        { firstName: { contains: query, mode: "insensitive" as const } },
        { lastName: { contains: query, mode: "insensitive" as const } },
        { email: { contains: query, mode: "insensitive" as const } },
        { company: { contains: query, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const [contacts, total] = await prisma.$transaction([
    prisma.contact.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: PAGE_SIZE + 1,
      select: contactSelect,
    }),
    prisma.contact.count({ where }),
  ]);
  const hasMore = contacts.length > PAGE_SIZE;
  const page = hasMore ? contacts.slice(0, PAGE_SIZE) : contacts;
  return NextResponse.json({
    contacts: page,
    total,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  });
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to add contacts." }, { status: 403 });

  try {
    const body = await request.json();
    const phoneInput = typeof body.phoneNumber === "string" ? body.phoneNumber : "";
    const phone = normalizePhoneNumber(phoneInput);
    const firstName = cleanOptionalText(body.firstName, 80);
    const lastName = cleanOptionalText(body.lastName, 80);
    const email = cleanOptionalText(body.email, 254);
    const company = cleanOptionalText(body.company, 120);
    const source = cleanOptionalText(body.source, 80) ?? "MANUAL";
    const customFields = body.customFields && typeof body.customFields === "object" && !Array.isArray(body.customFields)
      ? body.customFields : undefined;

    if (!phone) return NextResponse.json({ error: "Enter a valid phone number. Indian 10-digit mobile numbers and international numbers with +country code are supported." }, { status: 400 });
    if (email && !isValidEmail(email)) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (customFields && JSON.stringify(customFields).length > 10000) return NextResponse.json({ error: "Custom fields exceed the 10 KB limit." }, { status: 400 });

    const consentGiven = body.whatsappConsent === true;
    const contact = await prisma.$transaction(async (tx) => {
      const created = await tx.contact.create({
        data: {
          organizationId: context.organization.id,
          phoneNumber: phoneInput.trim(),
          phoneNumberE164: phone.e164,
          firstName, lastName, email, company, source,
          ...(customFields ? { customFields } : {}),
          ...(consentGiven ? {
            consents: { create: {
              channel: "WHATSAPP",
              purpose: "MARKETING",
              status: "GRANTED",
              source: "MANUAL_ENTRY",
              grantedAt: new Date(),
            } },
          } : {}),
        },
        select: contactSelect,
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organization.id,
          actorUserId: context.user.id,
          action: "contact.created",
          resourceType: "Contact",
          resourceId: created.id,
          metadata: { source, consentRecorded: consentGiven },
        },
      });
      return created;
    });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return NextResponse.json({ error: "This phone number already exists in your workspace." }, { status: 409 });
    }
    console.error("Contact creation failed", error);
    return NextResponse.json({ error: "Unable to create contact." }, { status: 500 });
  }
}
