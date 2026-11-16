import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isValidEmail, normalizePhoneNumber } from "./contacts";

test("normalizes Indian mobile numbers to E.164", () => {
  assert.deepEqual(normalizePhoneNumber("98765 43210"), { national: "9876543210", e164: "+919876543210" });
  assert.deepEqual(normalizePhoneNumber("+91 98765-43210"), { national: "919876543210", e164: "+919876543210" });
});

test("accepts valid international E.164 numbers", () => {
  assert.equal(normalizePhoneNumber("+14155552671")?.e164, "+14155552671");
});

test("rejects ambiguous and invalid phone numbers", () => {
  assert.equal(normalizePhoneNumber("12345"), null);
  assert.equal(normalizePhoneNumber("0123456789"), null);
  assert.equal(normalizePhoneNumber("+01234567890"), null);
});

test("validates email addresses", () => {
  assert.equal(isValidEmail("hello@example.com"), true);
  assert.equal(isValidEmail("not-an-email"), false);
});
