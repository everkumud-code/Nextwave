import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAuthContext, canManageSenders, isPlatformAdminUser } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import {
  MAX_IMPORT_ROWS, isValidTarget, mapContactRows, parseCsvTable, suggestMapping,
  type ColumnTarget, type ParsedContactRow, type RawTable,
} from "@/lib/contact-import";
import { MAX_XLSX_BYTES, readXlsxSheets } from "@/lib/contact-xlsx";

export const runtime = "nodejs";
const MAX_CSV_BYTES = 8 * 1024 * 1024;
const ALL_SHEETS = "__all__";
const CHUNK = 500;

type Action = "new" | "update" | "skip";

function badRequest(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** The table of one sheet (or of the CSV) with the meaning of its columns. */
function rowsOf(table: RawTable, mapping: ColumnTarget[] | null): { rows: ParsedContactRow[]; mapping: ColumnTarget[] } {
  const used = mapping ?? suggestMapping(table.headers, { unknownAsCustom: true });
  return { rows: mapContactRows(table, used), mapping: used };
}

function checkMapping(value: unknown, headerCount: number): ColumnTarget[] | string {
  if (!Array.isArray(value) || value.length !== headerCount) return "The column choices do not match the file.";
  if (value.some(item => typeof item !== "string" || !isValidTarget(item))) return "One of the column choices is not valid.";
  const targets = value as string[];
  for (const fixed of ["phone", "firstName", "lastName", "email", "company", "consent", "tags"]) {
    if (targets.filter(item => item === fixed).length > 1) return `Two columns are set to the same thing (${fixed}). Choose it for one column only.`;
  }
  const customs = targets.filter(item => item.startsWith("custom:"));
  if (new Set(customs).size !== customs.length) return "Two columns use the same extra-field name.";
  if (!targets.includes("phone")) return "Choose which column holds the phone number.";
  return targets;
}

export async function POST(request: Request) {
  const context = await getAuthContext();
  if (!context) return badRequest("Authentication required.", 401);
  try {
    let requestedOrganizationId: string | null = null;
    let importSource = "CSV_IMPORT";
    let previewOnly = true;
    let attestConsent = false;
    let existingMode: "skip" | "update" = "skip";
    let headers: string[] = [];
    let sheetNames: { name: string; rowCount: number }[] = [];
    let chosenSheet = "";
    let mappingInput: unknown = null;
    let rows: ParsedContactRow[] = [];
    let usedMapping: ColumnTarget[] = [];

    const contentType = request.headers.get("content-type") ?? "";
    let table: RawTable | null = null;
    let sheets: ReturnType<typeof readXlsxSheets> | null = null;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      requestedOrganizationId = typeof form.get("organizationId") === "string" ? String(form.get("organizationId")) : null;
      const file = form.get("file");
      previewOnly = form.get("preview") !== "false";
      attestConsent = form.get("attestConsent") === "true";
      existingMode = form.get("existing") === "update" ? "update" : "skip";
      chosenSheet = typeof form.get("sheet") === "string" ? String(form.get("sheet")) : "";
      const mappingText = typeof form.get("mapping") === "string" ? String(form.get("mapping")) : "";
      if (mappingText) { try { mappingInput = JSON.parse(mappingText); } catch { return badRequest("The column choices could not be read."); } }
      if (!file || typeof file === "string" || typeof file.arrayBuffer !== "function") return badRequest("Select a CSV or XLSX file.");
      const name = file.name.toLowerCase();
      if (name.endsWith(".xlsx")) {
        importSource = "XLSX_IMPORT";
        if (file.size > MAX_XLSX_BYTES) return badRequest("XLSX file must be 10 MB or smaller.", 413);
        sheets = readXlsxSheets(Buffer.from(await file.arrayBuffer()));
        sheetNames = sheets.map(sheet => ({ name: sheet.name, rowCount: sheet.rowCount }));
      } else if (name.endsWith(".csv")) {
        if (file.size > MAX_CSV_BYTES) return badRequest("CSV file must be 8 MB or smaller.", 413);
        table = parseCsvTable(await file.text());
      } else return badRequest("Only .csv and .xlsx files are supported.");
    } else {
      const body = await request.json();
      requestedOrganizationId = typeof body.organizationId === "string" ? body.organizationId : null;
      if (typeof body.csv !== "string" || !body.csv.trim()) return badRequest("Upload a CSV or XLSX file.");
      if (new TextEncoder().encode(body.csv).length > MAX_CSV_BYTES) return badRequest("CSV file must be 8 MB or smaller.", 413);
      previewOnly = body.preview !== false;
      attestConsent = body.attestConsent === true;
      existingMode = body.existing === "update" ? "update" : "skip";
      mappingInput = body.mapping ?? null;
      table = parseCsvTable(body.csv);
    }

    if (sheets) {
      const withData = sheets.filter(sheet => sheet.table);
      if (!withData.length) return badRequest("XLSX must include a header row and at least one contact.");
      if (chosenSheet === ALL_SHEETS) {
        // every sheet is read with its own headings; the chosen mapping does not apply
        for (const sheet of withData) {
          const part = rowsOf(sheet.table!, null);
          if (!part.mapping.includes("phone")) continue;
          rows.push(...part.rows);
        }
        if (!rows.length) return badRequest("None of the sheets has a phone column.");
        if (rows.length > MAX_IMPORT_ROWS) return badRequest(`A single import is limited to ${MAX_IMPORT_ROWS} rows.`);
        const seen = new Set<string>();
        rows = rows.map((row, index) => {
          const errors = row.errors.filter(error => !error.startsWith("Duplicate"));
          if (row.phoneNumberE164) { if (seen.has(row.phoneNumberE164)) errors.push("Duplicate phone number in this file"); seen.add(row.phoneNumberE164); }
          return { ...row, line: index + 2, errors };
        });
        headers = withData[0].table!.headers;
        usedMapping = [];
      } else {
        const sheet = withData.find(item => item.name === chosenSheet) ?? withData[0];
        chosenSheet = sheet.name;
        table = sheet.table;
      }
    }
    if (table) {
      headers = table.headers;
      let mapping: ColumnTarget[] | null = null;
      if (mappingInput) {
        const checked = checkMapping(mappingInput, table.headers.length);
        if (typeof checked === "string") return badRequest(checked);
        mapping = checked;
      } else if (previewOnly && !suggestMapping(table.headers).includes("phone")) {
        // no phone heading: show the mapping step instead of failing
        usedMapping = suggestMapping(table.headers, { unknownAsCustom: true });
        return NextResponse.json({ needsMapping: true, headers, sample: table.rows.slice(0, 3), mapping: usedMapping, sheets: sheetNames, sheet: chosenSheet, totalRows: table.rows.length });
      }
      const part = rowsOf(table, mapping);
      rows = part.rows; usedMapping = part.mapping;
    }

    const isAdmin = isPlatformAdminUser(context.user);
    if (requestedOrganizationId && !isAdmin) return badRequest("Platform admin access required.", 403);
    if (!requestedOrganizationId && !canManageSenders(context.role)) return badRequest("You do not have permission to import contacts.", 403);
    const organizationId = requestedOrganizationId || context.organization.id;

    const candidates = rows.filter(row => row.phoneNumberE164 && row.errors.length === 0);
    const existing = new Map<string, { id: string; status: string; tags: string[]; customFields: unknown }>();
    for (let i = 0; i < candidates.length; i += 2000) {
      const part = await prisma.contact.findMany({
        where: { organizationId, phoneNumberE164: { in: candidates.slice(i, i + 2000).map(row => row.phoneNumberE164!) } },
        select: { id: true, phoneNumberE164: true, status: true, tags: true, customFields: true },
      });
      for (const item of part) existing.set(item.phoneNumberE164, item);
    }

    const planned = rows.map(row => {
      let action: Action = "new";
      const errors = [...row.errors];
      if (errors.length) action = "skip";
      else if (row.phoneNumberE164 && existing.has(row.phoneNumberE164)) {
        if (existingMode === "update") action = "update";
        else { action = "skip"; errors.push("Already exists in this workspace"); }
      }
      return { ...row, errors, action };
    });
    const newRows = planned.filter(row => row.action === "new");
    const updateRows = planned.filter(row => row.action === "update");

    if (previewOnly) {
      return NextResponse.json({
        preview: planned.slice(0, 100),
        totalRows: planned.length,
        validCount: newRows.length + updateRows.length,
        newCount: newRows.length,
        updateCount: updateRows.length,
        invalidCount: planned.length - newRows.length - updateRows.length,
        duplicateCount: planned.filter(row => row.errors.some(error => error.toLowerCase().includes("duplicate") || error.toLowerCase().includes("already exists"))).length,
        headers, mapping: usedMapping, sheets: sheetNames, sheet: chosenSheet,
        extraFields: [...new Set(planned.flatMap(row => Object.keys(row.custom)))].slice(0, 30),
      });
    }
    if (!newRows.length && !updateRows.length) return NextResponse.json({ imported: 0, updated: 0, skipped: planned.length, message: "No valid contacts to import." });

    const startedAt = new Date();
    let imported = 0;
    let updated = 0;
    const consentFor = (row: ParsedContactRow) => ({
      channel: "WHATSAPP", purpose: "MARKETING", status: "GRANTED" as const,
      // an explicit yes in the file wins; otherwise the person who imported has confirmed it for the whole file
      source: row.whatsappConsent ? importSource : "IMPORT_ATTESTATION",
      evidenceRef: row.whatsappConsent ? null : `attested-by-user:${context.user.id}`,
      noticeVersion: row.whatsappConsent ? null : "attestation-v1",
      grantedAt: new Date(),
    });

    for (let i = 0; i < newRows.length; i += CHUNK) {
      const chunk = newRows.slice(i, i + CHUNK);
      await prisma.$transaction(async tx => {
        const made = await tx.contact.createMany({
          skipDuplicates: true,
          data: chunk.map(row => ({
            organizationId, phoneNumber: row.phoneNumber, phoneNumberE164: row.phoneNumberE164!,
            firstName: row.firstName, lastName: row.lastName, email: row.email, company: row.company,
            tags: row.tags, source: importSource,
            ...(Object.keys(row.custom).length ? { customFields: row.custom } : {}),
          })),
        });
        imported += made.count;
        const withConsent = chunk.filter(row => row.whatsappConsent || attestConsent);
        if (withConsent.length) {
          const ids = await tx.contact.findMany({
            where: { organizationId, createdAt: { gte: startedAt }, phoneNumberE164: { in: withConsent.map(row => row.phoneNumberE164!) } },
            select: { id: true, phoneNumberE164: true },
          });
          const byPhone = new Map(ids.map(item => [item.phoneNumberE164, item.id]));
          await tx.consentRecord.createMany({
            data: withConsent.flatMap(row => { const id = byPhone.get(row.phoneNumberE164!); return id ? [{ contactId: id, ...consentFor(row) }] : []; }),
          });
        }
      }, { timeout: 60_000 });
    }

    for (let i = 0; i < updateRows.length; i += 200) {
      const chunk = updateRows.slice(i, i + 200);
      await prisma.$transaction(async tx => {
        const consents = await tx.consentRecord.findMany({
          where: { contactId: { in: chunk.map(row => existing.get(row.phoneNumberE164!)!.id) }, channel: "WHATSAPP", purpose: "MARKETING", status: { in: ["GRANTED", "WITHDRAWN"] } },
          select: { contactId: true },
        });
        const hasConsentHistory = new Set(consents.map(item => item.contactId));
        for (const row of chunk) {
          const current = existing.get(row.phoneNumberE164!)!;
          const oldCustom = current.customFields && typeof current.customFields === "object" && !Array.isArray(current.customFields) ? current.customFields as Record<string, unknown> : {};
          const mergedCustom = { ...oldCustom, ...row.custom };
          await tx.contact.update({
            where: { id: current.id },
            data: {
              // a blank cell never erases what is already saved
              ...(row.firstName ? { firstName: row.firstName } : {}),
              ...(row.lastName ? { lastName: row.lastName } : {}),
              ...(row.email ? { email: row.email } : {}),
              ...(row.company ? { company: row.company } : {}),
              ...(row.tags.length ? { tags: [...new Set([...current.tags, ...row.tags])].slice(0, 30) } : {}),
              ...(Object.keys(row.custom).length ? { customFields: mergedCustom as Prisma.InputJsonValue } : {}),
            },
          });
          // somebody who opted out (or who already has a recorded yes) is never switched on by a spreadsheet
          if ((row.whatsappConsent || attestConsent) && current.status === "ACTIVE" && !hasConsentHistory.has(current.id)) {
            await tx.consentRecord.create({ data: { contactId: current.id, ...consentFor(row) } });
          }
          updated++;
        }
      }, { timeout: 60_000 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId, actorUserId: context.user.id, action: "contact.imported", resourceType: "Contact",
        metadata: { source: importSource, imported, updated, rows: planned.length, consentAttested: attestConsent, sheet: chosenSheet || null },
      },
    });
    const parts = [`${imported} new contacts imported`];
    if (updated) parts.push(`${updated} existing contacts updated`);
    return NextResponse.json({ imported, updated, skipped: planned.length - imported - updated, message: `${parts.join(", ")}.` });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("CSV") || error.message.includes("XLSX") || error.message.includes("column is required") || error.message.includes("limited to"))) {
      return badRequest(error.message);
    }
    console.error("Contact file import failed", error);
    return NextResponse.json({ error: "Unable to import contacts." }, { status: 500 });
  }
}
