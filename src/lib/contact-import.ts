import { isValidEmail, normalizePhoneNumber } from "@/lib/contacts";

/** The most rows one import accepts. */
export const MAX_IMPORT_ROWS = 20000;

export type ParsedContactRow = {
  line: number;
  phoneNumber: string;
  phoneNumberE164: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  whatsappConsent: boolean;
  /** Labels such as "delhi" or "vip" (a tags column, separated by commas, semicolons or |) */
  tags: string[];
  /** Every other column the person chose to keep (city, order_no, ...): usable in messages as {{city}} */
  custom: Record<string, string>;
  errors: string[];
};

/** A table as it is in the file, before anyone decided which column is which. */
export type RawTable = { headers: string[]; rows: string[][] };

/** What a column of the file means: phone, firstName, lastName, email, company, consent, tags, custom:<name> or ignore. */
export type ColumnTarget = string;

const FIXED_TARGETS = ["phone", "firstName", "lastName", "email", "company", "consent", "tags", "ignore"] as const;

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

/** A header becomes the name of an extra field: lower case, letters digits and _, starting with a letter. */
export function customKeyFromHeader(header: string): string {
  let key = header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  if (!key) return "";
  if (!/^[a-z]/.test(key)) key = `f_${key}`;
  return key;
}

export function isValidTarget(target: string): boolean {
  if ((FIXED_TARGETS as readonly string[]).includes(target)) return true;
  return /^custom:[a-z][a-z0-9_]{0,39}$/.test(target);
}

function parseCsvRecords(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"' && field.length === 0) quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim()); field = "";
      if (row.some(cell => cell.length > 0)) records.push(row);
      row = [];
    } else field += char;
  }
  row.push(field.trim());
  if (row.some(cell => cell.length > 0)) records.push(row);
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  return records;
}

/** Splits a CSV into its header row and the rows below it. */
export function parseCsvTable(input: string): RawTable {
  const records = parseCsvRecords(input);
  if (records.length < 2) throw new Error("CSV must include a header row and at least one contact.");
  return { headers: records[0], rows: records.slice(1) };
}

const ALIASES: Record<string, readonly string[]> = {
  phone: ["phone", "phone_number", "mobile", "mobile_number", "whatsapp", "whatsapp_number", "contact", "contact_number", "number", "phone_no", "mobile_no"],
  firstName: ["first_name", "firstname", "name", "full_name", "customer_name", "customer", "contact_name", "client_name"],
  lastName: ["last_name", "lastname", "surname"],
  email: ["email", "email_address", "e_mail", "mail"],
  company: ["company", "organisation", "organization", "company_name"],
  consent: ["whatsapp_consent", "marketing_consent", "consent"],
  tags: ["tags", "tag", "labels", "label", "segment", "group"],
};

/**
 * Guesses what every column means from its heading. A column nobody recognises is "ignore" (compatibility mode) or becomes
 * an extra field of the same name (so city, amount, order_no ... can be used inside a message).
 */
export function suggestMapping(headers: readonly string[], options: { unknownAsCustom?: boolean } = {}): ColumnTarget[] {
  const used = new Set<string>();
  const customUsed = new Set<string>();
  return headers.map(header => {
    const normal = normalizeHeader(header);
    for (const [target, names] of Object.entries(ALIASES)) {
      if (names.includes(normal) && !used.has(target)) { used.add(target); return target; }
    }
    if (options.unknownAsCustom) {
      const key = customKeyFromHeader(header);
      if (key && !["firstname", "lastname", "company", "phonenumber"].includes(key.replace(/_/g, "")) && !customUsed.has(key)) { customUsed.add(key); return `custom:${key}`; }
    }
    return "ignore";
  });
}

function splitTags(value: string): string[] {
  const tags = value.split(/[,;|]/).map(tag => tag.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 40)).filter(Boolean);
  return [...new Set(tags)].slice(0, 20);
}

/** Turns the raw rows into contacts using the chosen meaning of every column. */
export function mapContactRows(table: RawTable, targets: readonly ColumnTarget[], maxRows = MAX_IMPORT_ROWS): ParsedContactRow[] {
  const phoneIndex = targets.indexOf("phone");
  if (phoneIndex < 0) throw new Error("A phone column is required (phone, phone_number or mobile).");
  if (table.rows.length > maxRows) throw new Error(`A single import is limited to ${maxRows} rows.`);
  const at = (target: string) => targets.indexOf(target);
  const first = at("firstName"), last = at("lastName"), email = at("email"), company = at("company"), consent = at("consent"), tagsColumn = at("tags");
  const customColumns = targets.map((target, column) => ({ target, column })).filter(item => item.target.startsWith("custom:"));
  const seen = new Set<string>();
  return table.rows.map((cells, offset) => {
    const value = (column: number) => column < 0 ? "" : (cells[column] ?? "").trim();
    const rawPhone = value(phoneIndex);
    const normalized = normalizePhoneNumber(rawPhone);
    const emailValue = value(email);
    const errors: string[] = [];
    if (!normalized) errors.push("Invalid phone number");
    else if (seen.has(normalized.e164)) errors.push("Duplicate phone number in this file");
    if (normalized) seen.add(normalized.e164);
    if (emailValue && !isValidEmail(emailValue)) errors.push("Invalid email address");
    const consentValue = value(consent).toLowerCase();
    const custom: Record<string, string> = {};
    for (const { target, column } of customColumns) {
      const text = value(column).slice(0, 500);
      if (text) custom[target.slice("custom:".length)] = text;
    }
    return {
      line: offset + 2,
      phoneNumber: rawPhone,
      phoneNumberE164: normalized?.e164 ?? null,
      firstName: value(first) || null,
      lastName: value(last) || null,
      email: emailValue || null,
      company: value(company) || null,
      whatsappConsent: ["yes", "true", "1", "granted", "y"].includes(consentValue),
      tags: tagsColumn < 0 ? [] : splitTags(value(tagsColumn)),
      custom,
      errors,
    };
  });
}

/** CSV text straight to contacts, columns recognised by their headings (kept for the simple case and the tests). */
export function parseContactCsv(input: string, maxRows = MAX_IMPORT_ROWS): ParsedContactRow[] {
  const table = parseCsvTable(input);
  return mapContactRows(table, suggestMapping(table.headers, { unknownAsCustom: true }), maxRows);
}
