import test from "node:test";
import assert from "node:assert/strict";
import { highestReceiptStatus, receiptCanAdvance } from "./receipt-status.js";

test("receipt status only moves forward", () => {
  assert.equal(highestReceiptStatus("SENT", "DELIVERED"), "DELIVERED");
  assert.equal(highestReceiptStatus("READ", "SENT"), "READ");
  assert.equal(highestReceiptStatus("DELIVERED", "READ"), "READ");
});

test("late receipts can correct a provider-accepted failure but not cancellation", () => {
  assert.equal(receiptCanAdvance("FAILED", "DELIVERED"), true);
  assert.equal(receiptCanAdvance("CANCELLED", "READ"), false);
  assert.equal(receiptCanAdvance("READ", "SENT"), false);
  assert.equal(receiptCanAdvance("SUBMITTED", "SENT"), true);
});
