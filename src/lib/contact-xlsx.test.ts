import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { parseContactXlsx } from "./contact-xlsx";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files: Record<string, string>): Buffer {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name);
    const raw = Buffer.from(text);
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(8, 8);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, compressed);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(8, 10);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(compressed.length, 20);
    record.writeUInt32LE(raw.length, 24);
    record.writeUInt16LE(filename.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(record, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const centralBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBytes, end]);
}

test("XLSX contact parser reads shared strings, inline strings and consent flags", () => {
  const shared = ["phone", "first_name", "last_name", "email", "company", "whatsapp_consent", "9876543210", "Asha", "Kumar", "asha@example.com", "Acme", "yes"];
  const sharedXml = `<?xml version="1.0"?><sst>${shared.map(value => `<si><t>${value}</t></si>`).join("")}</sst>`;
  const sheet = `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1">${shared.slice(0, 6).map((_, index) => `<c r="${String.fromCharCode(65 + index)}1" t="s"><v>${index}</v></c>`).join("")}</row>
    <row r="2"><c r="A2" t="s"><v>6</v></c><c r="B2" t="s"><v>7</v></c><c r="C2" t="s"><v>8</v></c><c r="D2" t="s"><v>9</v></c><c r="E2" t="s"><v>10</v></c><c r="F2" t="s"><v>11</v></c></row>
  </sheetData></worksheet>`;
  const workbook = makeZip({
    "xl/workbook.xml": `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Contacts" sheetId="2" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet2.xml"/></Relationships>`,
    "xl/sharedStrings.xml": sharedXml,
    "xl/worksheets/sheet2.xml": sheet,
  });
  const [row] = parseContactXlsx(workbook);
  assert.equal(row.phoneNumberE164, "+919876543210");
  assert.equal(row.firstName, "Asha");
  assert.equal(row.lastName, "Kumar");
  assert.equal(row.email, "asha@example.com");
  assert.equal(row.company, "Acme");
  assert.equal(row.whatsappConsent, true);
  assert.deepEqual(row.errors, []);
});

test("XLSX contact parser rejects non-workbook input and missing worksheets", () => {
  assert.throws(() => parseContactXlsx(Buffer.from("not-a-zip")), /valid XLSX/);
  assert.throws(() => parseContactXlsx(makeZip({ "xl/workbook.xml": "<workbook/>" })), /header row/);
});

import { readXlsxSheets } from "./contact-xlsx";

test("every worksheet of a workbook is listed with its name and rows", () => {
  const cell = (ref: string, text: string) => `<c r="${ref}" t="inlineStr"><is><t>${text}</t></is></c>`;
  const sheet = (rows: string[][]) => `<worksheet><sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((text, c) => cell(`${String.fromCharCode(65 + c)}${r + 1}`, text)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const workbook = makeZip({
    "xl/workbook.xml": `<workbook xmlns:r="x"><sheets><sheet name="Delhi" sheetId="1" r:id="rId1"/><sheet name="Pune" sheetId="2" r:id="rId2"/><sheet name="Empty" sheetId="3" r:id="rId3"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": sheet([["phone", "city"], ["9876543210", "Delhi"], ["9876543211", "Delhi"]]),
    "xl/worksheets/sheet2.xml": sheet([["Mobile", "Shehar"], ["9876543212", "Pune"]]),
    "xl/worksheets/sheet3.xml": sheet([["phone"]]),
  });
  const sheets = readXlsxSheets(workbook);
  assert.deepEqual(sheets.map(item => [item.name, item.rowCount]), [["Delhi", 2], ["Pune", 1], ["Empty", 0]]);
  assert.deepEqual(sheets[1].table?.headers, ["Mobile", "Shehar"]);
  assert.equal(sheets[2].table, null);
});
