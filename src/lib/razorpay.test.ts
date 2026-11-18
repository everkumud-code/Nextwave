import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyPaymentSignature, verifyWebhookSignature } from "./razorpay";
import { formatInvoiceCode } from "./ids";

test("a payment is trusted only when the signature matches order|payment", () => {
  const good = createHmac("sha256", "secret").update("order_1|pay_1").digest("hex");
  assert.equal(verifyPaymentSignature("order_1", "pay_1", good, "secret"), true);
  assert.equal(verifyPaymentSignature("order_1", "pay_2", good, "secret"), false);
  assert.equal(verifyPaymentSignature("order_1", "pay_1", good, "other-secret"), false);
  assert.equal(verifyPaymentSignature("order_1", "pay_1", "", "secret"), false);
});

test("a webhook is trusted only when the body signature matches", () => {
  const body = JSON.stringify({ event: "payment.captured" });
  const good = createHmac("sha256", "hook").update(body).digest("hex");
  assert.equal(verifyWebhookSignature(body, good, "hook"), true);
  assert.equal(verifyWebhookSignature(body + " ", good, "hook"), false);
});

test("invoice numbers follow the client number", () => {
  assert.equal(formatInvoiceCode("BPML/2026/NR001", 3), "BPML/2026/NR001/INV0003");
});
