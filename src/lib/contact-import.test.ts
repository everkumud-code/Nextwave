import test from "node:test";
import assert from "node:assert/strict";
import { parseContactCsv } from "./contact-import";

test("parses quoted CSV values and normalizes Indian numbers", () => {
  const rows = parseContactCsv('name,phone,email,company\n"Ravi, Kumar",9876543210,ravi@example.com,"Acme, India"');
  assert.equal(rows[0].firstName, "Ravi, Kumar");
  assert.equal(rows[0].phoneNumberE164, "+919876543210");
  assert.equal(rows[0].company, "Acme, India");
  assert.deepEqual(rows[0].errors, []);
});

test("flags invalid rows and duplicates within the file", () => {
  const rows = parseContactCsv("phone,email\n9876543210,bad-email\n9876543210,\n123,");
  assert.deepEqual(rows[0].errors, ["Invalid email address"]);
  assert.deepEqual(rows[1].errors, ["Duplicate phone number in this file"]);
  assert.deepEqual(rows[2].errors, ["Invalid phone number"]);
});

test("records explicit consent and rejects missing phone headers", () => {
  const rows = parseContactCsv("mobile,marketing_consent\n9876543210,yes");
  assert.equal(rows[0].whatsappConsent, true);
  assert.throws(() => parseContactCsv("name,email\nA,a@b.com"), /phone column is required/i);
});

import { mapContactRows, parseCsvTable, suggestMapping, customKeyFromHeader } from "./contact-import";

test("unknown columns become extra fields and a tags column is split", () => {
  const rows = parseContactCsv("Name,Mobile No,City,Order No,Tags\nRavi,9876543210,Delhi,A-12,\"VIP; Delhi North, vip\"");
  assert.equal(rows[0].firstName, "Ravi");
  assert.equal(rows[0].phoneNumberE164, "+919876543210");
  assert.deepEqual(rows[0].custom, { city: "Delhi", order_no: "A-12" });
  assert.deepEqual(rows[0].tags, ["vip", "delhi north"]);
});

test("the person can choose what every column means", () => {
  const table = parseCsvTable("a,b,c\nx,9876543210,hello");
  const rows = mapContactRows(table, ["firstName", "phone", "custom:note"]);
  assert.equal(rows[0].firstName, "x");
  assert.equal(rows[0].phoneNumberE164, "+919876543210");
  assert.deepEqual(rows[0].custom, { note: "hello" });
  assert.throws(() => mapContactRows(table, ["firstName", "ignore", "ignore"]), /phone column is required/i);
});

test("headings are recognised without a fixed spelling", () => {
  assert.deepEqual(suggestMapping(["Phone Number", "First Name", "E-mail", "Company Name", "Permission"]), ["phone", "firstName", "email", "company", "ignore"]);
  assert.equal(customKeyFromHeader("Order No."), "order_no");
  assert.equal(customKeyFromHeader("1st visit"), "f_1st_visit");
});
