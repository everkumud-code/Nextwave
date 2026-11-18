import { deflateSync } from "node:zlib";
import PDFDocument from "pdfkit";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A small PNG (a blue picture with a white wave line) used by the delivery self-test. No image library needed. */
export function selfTestPng(width = 240, height = 120): Buffer {
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const wave = Math.round(height / 2 + Math.sin(x / 14) * (height / 5));
      const onLine = Math.abs(y - wave) <= 2;
      const base = 1 + x * 3;
      row[base] = onLine ? 255 : 10; row[base + 1] = onLine ? 255 : 120; row[base + 2] = onLine ? 255 : 204;
    }
    rows.push(row);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

/** A one-page PDF for the delivery self-test. */
export async function selfTestPdf(): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A5", margin: 40, info: { Title: "NextWave test file" } });
  const parts: Buffer[] = [];
  doc.on("data", (part: Buffer) => parts.push(part));
  const done = new Promise<Buffer>(resolve => doc.on("end", () => resolve(Buffer.concat(parts))));
  doc.fontSize(20).fillColor("#0B2E52").text("NextWave test file");
  doc.moveDown().fontSize(11).fillColor("#334155").text("If you can open this PDF on your phone, documents are delivered correctly from this number.");
  doc.end();
  return done;
}
