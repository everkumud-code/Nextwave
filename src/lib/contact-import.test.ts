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
