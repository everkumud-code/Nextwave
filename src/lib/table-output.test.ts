import test from "node:test";
import assert from "node:assert/strict";
import { parseFormat, toCsv, toPdf, toXlsx } from "./table-output";
import { readXlsxSheets } from "./contact-xlsx";

test("the format comes from ?format= and defaults to csv", () => {
  assert.equal(parseFormat("xlsx"), "xlsx");
  assert.equal(parseFormat("pdf"), "pdf");
  assert.equal(parseFormat("anything"), "csv");
  assert.equal(parseFormat(null), "csv");
});

test("csv quotes every cell", () => {
  assert.equal(toCsv(["a", "b"], [["x,y", 'say "hi"']]), '﻿"a","b"\r\n"x,y","say ""hi"""');
});

test("an Excel file written here can be read back, numbers and text, special characters included", () => {
  const file = toXlsx("Report", ["name", "amount", "note"], [["Ravi & Sons", 12.5, "<ok>"], ["नमस्ते", 7, null]]);
  const [sheet] = readXlsxSheets(file);
  assert.equal(sheet.name, "Report");
  assert.deepEqual(sheet.table?.headers, ["name", "amount", "note"]);
  assert.deepEqual(sheet.table?.rows[0], ["Ravi & Sons", "12.5", "<ok>"]);
  assert.equal(sheet.table?.rows[1][0], "नमस्ते");
  assert.equal(sheet.table?.rows[1][1], "7");
});

test("a pdf report is produced and starts with the PDF marker", async () => {
  const rows = Array.from({ length: 120 }, (_, i) => [`row ${i}`, i, "some text"]);
  const pdf = await toPdf("Test report", "subtitle", ["a", "b", "c"], rows);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1000);
});
