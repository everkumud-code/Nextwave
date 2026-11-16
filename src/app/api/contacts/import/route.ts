import { NextResponse } from "next/server";
import { getAuthContext, canManageSenders } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { parseContactCsv, type ParsedContactRow } from "@/lib/contact-import";
import { parseContactXlsx } from "@/lib/contact-xlsx";

export const runtime = "nodejs";
const MAX_CSV_BYTES = 2 * 1024 * 1024;
const MAX_XLSX_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!canManageSenders(context.role)) return NextResponse.json({ error: "You do not have permission to import contacts." }, { status: 403 });

  try {
    let rows: ParsedContactRow[];
    let importSource = "CSV_IMPORT";
    let previewOnly = true;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      previewOnly = form.get("preview") !== "false";
      if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return NextResponse.json({ error: "Select a CSV or XLSX file." }, { status: 400 });
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx")) {
        importSource = "XLSX_IMPORT";
        if (file.size > MAX_XLSX_BYTES) return NextResponse.json({ error: "XLSX file must be 5 MB or smaller." }, { status: 413 });
        rows = parseContactXlsx(Buffer.from(await file.arrayBuffer()));
      } else if (name.endsWith(".csv")) {
        if (file.size > MAX_CSV_BYTES) return NextResponse.json({ error: "CSV file must be 2 MB or smaller." }, { status: 413 });
        importSource = "CSV_IMPORT";
        rows = parseContactCsv(await file.text());
      } else return NextResponse.json({ error: "Only .csv and .xlsx files are supported." }, { status: 400 });
    } else {
      const body = await request.json();
      if (typeof body.csv !== "string" || !body.csv.trim()) return NextResponse.json({ error: "Upload a CSV or XLSX file." }, { status: 400 });
      if (new TextEncoder().encode(body.csv).length > MAX_CSV_BYTES) return NextResponse.json({ error: "CSV file must be 2 MB or smaller." }, { status: 413 });
      previewOnly = body.preview !== false;
      rows = parseContactCsv(body.csv);
    }
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
    if (previewOnly) {
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
              source: importSource,
              ...(row.whatsappConsent ? { consents: { create: {
                channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED",
                source: importSource, grantedAt: new Date(),
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
              metadata: { source: importSource, consentRecorded: row.whatsappConsent, sourceLine: row.line },
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
    if (error instanceof Error && (error.message.startsWith("CSV") || error.message.includes("XLSX") || error.message.includes("column is required") || error.message.includes("limited to"))) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Contact file import failed", error);
    return NextResponse.json({ error: "Unable to import contacts." }, { status: 500 });
  }
}
