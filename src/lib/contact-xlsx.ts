import { inflateRawSync } from "node:zlib";
import { mapContactRows, suggestMapping, MAX_IMPORT_ROWS, type ParsedContactRow, type RawTable } from "@/lib/contact-import";

type ZipEntry = { name: string; method: number; compressedSize: number; uncompressedSize: number; localOffset: number };

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  let eocd = -1;
  const lowerBound = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= lowerBound; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This file is not a valid XLSX workbook.");
  const count = buffer.readUInt16LE(eocd + 10);
  if (count > 1000) throw new Error("The XLSX workbook contains too many archive entries.");
  let cursor = buffer.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("The XLSX archive directory is invalid.");
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }

  const files = new Map<string, Buffer>();
  let totalUncompressed = 0;
  for (const entry of entries) {
    totalUncompressed += entry.uncompressedSize;
    if (totalUncompressed > 60 * 1024 * 1024) throw new Error("The XLSX workbook expands beyond the 60 MB processing limit.");
    if (entry.uncompressedSize > 30 * 1024 * 1024) throw new Error("An XLSX workbook entry exceeds the processing limit.");
    if (entry.name.startsWith("xl/") && !entry.name.endsWith("/")) {
      const offset = entry.localOffset;
      if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
        throw new Error("The XLSX workbook contains an invalid file entry.");
      }
      const nameLength = buffer.readUInt16LE(offset + 26);
      const extraLength = buffer.readUInt16LE(offset + 28);
      const start = offset + 30 + nameLength + extraLength;
      const compressed = buffer.subarray(start, start + entry.compressedSize);
      let data: Buffer;
      if (entry.method === 0) data = compressed;
      else if (entry.method === 8) data = inflateRawSync(compressed);
      else throw new Error("This XLSX workbook uses an unsupported compression method.");
      if (data.length !== entry.uncompressedSize) throw new Error("The XLSX workbook contains a truncated entry.");
      files.set(entry.name, data);
    }
  }
  return files;
}

function decodeXml(value: string): string {
  return value.replace(/&#x([\da-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, number: string) => String.fromCodePoint(Number(number)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

function columnIndex(reference: string): number {
  const letters = reference.match(/^[A-Z]+/i)?.[0]?.toUpperCase() ?? "A";
  let value = 0;
  for (const char of letters) value = value * 26 + char.charCodeAt(0) - 64;
  return value - 1;
}

function cellText(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => decodeXml(match[1])).join("");
}

export const MAX_XLSX_BYTES = 10 * 1024 * 1024;

/** Every worksheet of the workbook with its name and the cells of its rows (empty rows are dropped). */
export function readXlsxSheets(input: Buffer): { name: string; table: RawTable | null; rowCount: number }[] {
  if (input.length < 4 || input.length > MAX_XLSX_BYTES) throw new Error("XLSX file must be between 1 byte and 10 MB.");
  const files = readZipEntries(input);
  const workbookXml = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const relationships = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const targets = new Map<string, string>();
  for (const match of relationships.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1];
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target) targets.set(id, target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target.replace(/^\.\//, "")}`);
  }
  const sheetRefs = [...workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)].map(match => ({
    name: decodeXml(match[1].match(/\bname="([^"]*)"/)?.[1] ?? "Sheet"),
    id: match[1].match(/\br:id="([^"]+)"/)?.[1] ?? "",
  }));
  if (!sheetRefs.length) sheetRefs.push({ name: "Sheet1", id: "" });
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => cellText(match[1]));
  const sheets: { name: string; table: RawTable | null; rowCount: number }[] = [];
  for (const ref of sheetRefs.slice(0, 30)) {
    const sheet = files.get(targets.get(ref.id) ?? "xl/worksheets/sheet1.xml");
    if (!sheet) continue;
    const xml = sheet.toString("utf8");
    const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(match => {
      const values: string[] = [];
      for (const cell of match[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
        const attrs = cell[1] ?? cell[3] ?? "";
        const body = cell[2] ?? "";
        const cellRef = attrs.match(/\br="([^"]+)"/)?.[1] ?? "A1";
        const type = attrs.match(/\bt="([^"]+)"/)?.[1];
        const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
        const value = type === "s" ? (shared[Number(raw)] ?? "")
          : type === "inlineStr" ? cellText(body)
          : type === "b" ? (raw === "1" ? "true" : "false")
          : decodeXml(raw);
        values[columnIndex(cellRef)] = value;
      }
      return Array.from(values, value => (value ?? "").trim());
    }).filter(row => row.some(value => value));
    sheets.push({ name: ref.name, rowCount: Math.max(0, rows.length - 1), table: rows.length >= 2 ? { headers: rows[0], rows: rows.slice(1) } : null });
  }
  return sheets;
}

/** The first worksheet straight to contacts, columns recognised by their headings (kept for the simple case and the tests). */
export function parseContactXlsx(input: Buffer, maxRows = MAX_IMPORT_ROWS): ParsedContactRow[] {
  const sheet = readXlsxSheets(input).find(item => item.table);
  if (!sheet?.table) throw new Error("XLSX must include a header row and at least one contact.");
  if (sheet.table.rows.length > maxRows) throw new Error(`A single import is limited to ${maxRows} rows.`);
  return mapContactRows(sheet.table, suggestMapping(sheet.table.headers, { unknownAsCustom: true }), maxRows);
}
