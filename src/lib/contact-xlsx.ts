import { inflateRawSync } from "node:zlib";
import { parseContactCsv, type ParsedContactRow } from "@/lib/contact-import";

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
    if (totalUncompressed > 20 * 1024 * 1024) throw new Error("The XLSX workbook expands beyond the 20 MB processing limit.");
    if (entry.uncompressedSize > 10 * 1024 * 1024) throw new Error("An XLSX workbook entry exceeds the processing limit.");
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

export function parseContactXlsx(input: Buffer, maxRows = 5000): ParsedContactRow[] {
  if (input.length < 4 || input.length > 5 * 1024 * 1024) throw new Error("XLSX file must be between 1 byte and 5 MB.");
  const files = readZipEntries(input);
  const workbookXml = files.get("xl/workbook.xml")?.toString("utf8") ?? "";
  const firstSheet = workbookXml.match(/<sheet\\b[^>]*\\br:id="([^"]+)"/)?.[1];
  const relationships = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const relationship = firstSheet
    ? [...relationships.matchAll(/<Relationship\\b([^>]*)\\/>/g)].find(match => match[1].match(/\\bId="([^"]+)"/)?.[1] === firstSheet)
    : undefined;
  const target = relationship?.[1].match(/\\bTarget="([^"]+)"/)?.[1];
  const sheetPath = target
    ? (target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target.replace(/^\\.\\//, "")}`)
    : "xl/worksheets/sheet1.xml";
  const sheet = files.get(sheetPath);
  if (!sheet) throw new Error("The XLSX workbook must contain a readable first worksheet.");
  const sharedXml = files.get("xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(match => cellText(match[1]));
  const xml = sheet.toString("utf8");
  const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(match => {
    const values: string[] = [];
    for (const cell of match[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
      const attrs = cell[1] ?? cell[3] ?? "";
      const body = cell[2] ?? "";
      const ref = attrs.match(/\br="([^"]+)"/)?.[1] ?? "A1";
      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "";
      const value = type === "s" ? (shared[Number(raw)] ?? "")
        : type === "inlineStr" ? cellText(body)
        : type === "b" ? (raw === "1" ? "true" : "false")
        : decodeXml(raw);
      values[columnIndex(ref)] = value;
    }
    return values.map(value => value ?? "");
  }).filter(row => row.some(value => value.trim()));
  if (rows.length < 2) throw new Error("XLSX must include a header row and at least one contact.");
  if (rows.length - 1 > maxRows) throw new Error(`A single import is limited to ${maxRows} rows.`);
  const csv = rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n");
  return parseContactCsv(csv, maxRows);
}
