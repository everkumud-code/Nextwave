import { deflateRawSync } from "node:zlib";
import PDFDocument from "pdfkit";

export type Cell = string | number | boolean | null | undefined;
export type ReportFormat = "csv" | "xlsx" | "pdf";

export function parseFormat(value: string | null): ReportFormat {
  return value === "xlsx" || value === "pdf" ? value : "csv";
}

// ---------------------------------------------------------------- CSV
const csvCell = (value: Cell) => `"${(value === null || value === undefined ? "" : String(value)).replace(/"/g, '""')}"`;

export function toCsv(header: string[], rows: Cell[][]): string {
  return "﻿" + [header.map(csvCell).join(","), ...rows.map(row => row.map(csvCell).join(","))].join("\r\n");
}

// ---------------------------------------------------------------- XLSX (a small writer: one sheet, text and numbers, no extra library)
function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const raw = Buffer.from(text, "utf8");
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(raw.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(compressed.length, 20); entry.writeUInt32LE(raw.length, 24); entry.writeUInt16LE(filename.length, 28); entry.writeUInt32LE(offset, 42);
    central.push(entry, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, end]);
}

const xmlEscape = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

export function toXlsx(sheetName: string, header: string[], rows: Cell[][]): Buffer {
  const sheetRow = (cells: Cell[], rowNumber: number, bold: boolean) => `<row r="${rowNumber}">${cells.map((value, column) => {
    const ref = `${columnName(column)}${rowNumber}`;
    if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
    const text = value === null || value === undefined ? "" : String(value);
    return text === "" ? "" : `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ""}><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
  }).join("")}</row>`;
  const widths = header.map((title, column) => {
    const longest = Math.max(title.length, ...rows.slice(0, 200).map(row => String(row[column] ?? "").length));
    return Math.min(60, Math.max(10, longest + 2));
  });
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((width, i) => `<col min="${i + 1}" max="${i + 1}" width="${width}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRow(header, 1, true)}${rows.map((row, i) => sheetRow(row, i + 2, false)).join("")}</sheetData></worksheet>`;
  return zip({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xmlEscape(sheetName.slice(0, 31))}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": sheet,
  });
}

// ---------------------------------------------------------------- PDF (a clear table, landscape A4, at most the first rows)
export const PDF_MAX_ROWS = 1500;

export async function toPdf(title: string, subtitle: string, header: string[], rows: Cell[][], keep?: number[]): Promise<Buffer> {
  const columns = keep ?? header.map((_, index) => index);
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28, info: { Title: title } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const finished = new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const pageWidth = doc.page.width - 56;
  const weights = columns.map(column => Math.min(40, Math.max(6, Math.max(header[column].length, ...rows.slice(0, 80).map(row => String(row[column] ?? "").length)))));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  const widths = weights.map(weight => (weight / totalWeight) * pageWidth);

  doc.fillColor("#0B2E52").fontSize(16).font("Helvetica-Bold").text("NextWave", { continued: true }).fillColor("#64748b").fontSize(10).font("Helvetica").text(`   ${title}`);
  doc.fillColor("#64748b").fontSize(8).text(subtitle);
  doc.moveDown(0.6);

  const drawRow = (cells: string[], bold: boolean, shade: boolean) => {
    const y = doc.y;
    const font = bold ? "Helvetica-Bold" : "Helvetica";
    doc.font(font).fontSize(7);
    const heights = cells.map((text, i) => doc.heightOfString(text, { width: widths[i] - 6 }));
    const height = Math.min(48, Math.max(...heights)) + 6;
    if (y + height > doc.page.height - 36) { doc.addPage(); return drawRow(cells, bold, shade); }
    if (bold || shade) doc.save().rect(28, y, pageWidth, height).fill(bold ? "#E6F1FA" : "#F8FAFC").restore();
    let x = 28;
    cells.forEach((text, i) => {
      doc.fillColor("#0f172a").font(font).fontSize(7).text(text, x + 3, y + 3, { width: widths[i] - 6, height: height - 4, ellipsis: true });
      x += widths[i];
    });
    doc.y = y + height;
  };

  drawRow(columns.map(column => header[column]), true, false);
  const shown = rows.slice(0, PDF_MAX_ROWS);
  shown.forEach((row, index) => drawRow(columns.map(column => String(row[column] ?? "")), false, index % 2 === 1));
  if (rows.length > shown.length) {
    doc.moveDown(0.5).fillColor("#b45309").fontSize(8).font("Helvetica").text(`Showing the first ${shown.length} of ${rows.length} rows. Download the Excel or CSV file to get all of them.`, 28);
  }
  doc.end();
  return finished;
}

const TYPES: Record<ReportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

/** The same table as CSV, Excel or PDF, chosen by ?format=. */
export async function tableResponse(input: { format: ReportFormat; fileBase: string; title: string; subtitle?: string; header: string[]; rows: Cell[][]; pdfColumns?: number[] }): Promise<Response> {
  const { format, fileBase, title, header, rows } = input;
  let body: string | Buffer;
  if (format === "xlsx") body = toXlsx(title, header, rows);
  else if (format === "pdf") body = await toPdf(title, input.subtitle ?? `Generated ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST`, header, rows, input.pdfColumns);
  else body = toCsv(header, rows);
  const payload = typeof body === "string" ? body : new Uint8Array(body);
  return new Response(payload, { headers: { "Content-Type": TYPES[format], "Content-Disposition": `attachment; filename="${fileBase}.${format}"`, "Cache-Control": "no-store" } });
}
