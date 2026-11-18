import test from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret, secretBoxAvailable } from "./secret-box";

test("a secret is stored encrypted, differently every time, and reads back", () => {
  process.env.APP_ENCRYPTION_KEY = "unit-test-key-1";
  assert.equal(secretBoxAvailable(), true);
  const a = encryptSecret("abcd efgh ijkl mnop");
  const b = encryptSecret("abcd efgh ijkl mnop");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("v1:") && !a.includes("abcd"));
  assert.equal(decryptSecret(a), "abcd efgh ijkl mnop");
});

test("a changed value or another key does not decrypt", () => {
  process.env.APP_ENCRYPTION_KEY = "unit-test-key-1";
  const stored = encryptSecret("secret");
  const tampered = stored.slice(0, -2) + (stored.endsWith("AA") ? "BB" : "AA");
  assert.throws(() => decryptSecret(tampered));
  process.env.APP_ENCRYPTION_KEY = "another-key";
  assert.throws(() => decryptSecret(stored));
  assert.throws(() => decryptSecret("plain text"));
});

test("without a key nothing is encrypted", () => {
  delete process.env.APP_ENCRYPTION_KEY;
  delete process.env.QR_CREDENTIAL_ENCRYPTION_KEY;
  assert.equal(secretBoxAvailable(), false);
  assert.throws(() => encryptSecret("x"), /NO_ENCRYPTION_KEY/);
});
