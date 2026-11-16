import { isValidEmail, normalizePhoneNumber } from "@/lib/contacts";

export type ParsedContactRow = {
  line: number;
  phoneNumber: string;
  phoneNumberE164: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  company: string | null;
  whatsappConsent: boolean;
  errors: string[];
};

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function parseCsvRecords(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
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

export function parseContactCsv(input: string, maxRows = 5000): ParsedContactRow[] {
  const records = parseCsvRecords(input);
  if (records.length < 2) throw new Error("CSV must include a header row and at least one contact.");
  const headers = records[0].map(normalizeHeader);
  const index = (...names: string[]) => headers.findIndex(header => names.includes(header));
  const phoneIndex = index("phone", "phone_number", "mobile", "mobile_number", "whatsapp", "whatsapp_number");
  if (phoneIndex < 0) throw new Error("A phone column is required (phone, phone_number or mobile).");
  if (records.length - 1 > maxRows) throw new Error(`A single import is limited to ${maxRows} rows.`);
  const first = index("first_name", "firstname", "name");
  const last = index("last_name", "lastname", "surname");
  const email = index("email", "email_address");
  const company = index("company", "organisation", "organization");
  const consent = index("whatsapp_consent", "marketing_consent", "consent");
  const seen = new Set<string>();
  return records.slice(1).map((cells, offset) => {
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
    return {
      line: offset + 2,
      phoneNumber: rawPhone,
      phoneNumberE164: normalized?.e164 ?? null,
      firstName: value(first) || null,
      lastName: value(last) || null,
      email: emailValue || null,
      company: value(company) || null,
      whatsappConsent: ["yes", "true", "1", "granted"].includes(consentValue),
      errors,
    };
  });
}
