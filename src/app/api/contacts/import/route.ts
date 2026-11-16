import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { parseContactCsv } from "@/lib/contact-import";

export const runtime = "nodejs";
const MAX_CSV_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to import contacts." }, { status: 403 });

  try {
    const body = await request.json();
    if (typeof body.csv !== "string" || !body.csv.trim()) return NextResponse.json({ error: "Upload a CSV file." }, { status: 400 });
    if (new TextEncoder().encode(body.csv).length > MAX_CSV_BYTES) return NextResponse.json({ error: "CSV file must be 2 MB or smaller." }, { status: 413 });
    const rows = parseContactCsv(body.csv);
    const candidates = rows.filter(row => row.phoneNumberE164 && row.errors.length === 0);
    const existing = await prisma.contact.findMany({
      where: { organizationId: context.organization.id, phoneNumberE164: { in: candidates.map(row => row.phoneNumberE164!) } },
      select: { phoneNumberE164: true },
    });
    const existingNumbers = new Set(existing.map(row => row.phoneNumberE164));
    const preview = rows.map(row => ({
      ...row,
      errors: [...row.errors, ...(row.phoneNumberE164 && existingNumbers.has(row.phoneNumberE164) ? ["Already exists in this workspace"] : [])],
    }));
    const valid = preview.filter(row => row.errors.length === 0);
    if (body.preview !== false) {
      return NextResponse.json({
        preview: preview.slice(0, 100),
        totalRows: preview.length,
        validCount: valid.length,
        invalidCount: preview.length - valid.length,
        duplicateCount: preview.filter(row => row.errors.some(error => error.toLowerCase().includes("duplicate") || error.toLowerCase().includes("already exists"))).length,
      });
    }
    if (valid.length === 0) return NextResponse.json({ imported: 0, skipped: preview.length, message: "No valid new contacts to import." });
    let imported = 0;
    for (const row of valid) {
      try {
        await prisma.$transaction(async tx => {
          const contact = await tx.contact.create({
            data: {
              organizationId: context.organization.id,
              phoneNumber: row.phoneNumber,
              phoneNumberE164: row.phoneNumberE164!,
              firstName: row.firstName,
              lastName: row.lastName,
              email: row.email,
              company: row.company,
              source: "CSV_IMPORT",
              ...(row.whatsappConsent ? { consents: { create: {
                channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED",
                source: "CSV_IMPORT", grantedAt: new Date(),
              } } } : {}),
            },
            select: { id: true },
          });
          await tx.auditLog.create({
            data: {
              organizationId: context.organization.id,
              actorUserId: context.user.id,
              action: "contact.imported",
              resourceType: "Contact",
              resourceId: contact.id,
              metadata: { source: "CSV_IMPORT", consentRecorded: row.whatsappConsent, csvLine: row.line },
            },
          });
        });
        imported++;
      } catch (error) {
        if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
      }
    }
    return NextResponse.json({ imported, skipped: preview.length - imported, message: `${imported} contacts imported successfully.` });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("CSV") || error.message.includes("column is required") || error.message.includes("limited to"))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Contact CSV import failed", error);
    return NextResponse.json({ error: "Unable to import contacts." }, { status: 500 });
  }
}
