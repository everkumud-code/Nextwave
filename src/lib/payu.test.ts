import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { formatAmount, requestHash, responseHash, responseHashIsValid } from "./payu";
import { formatInvoiceCode } from "./ids";

const sha = (text: string) => createHash("sha512").update(text).digest("hex");

test("the request hash follows PayU's field order", () => {
  const fields = { key: "K", txnid: "T1", amount: "500.00", productinfo: "Credit", firstname: "Asha", email: "a@b.in" };
  assert.equal(requestHash(fields, "SALT"), sha(["K", "T1", "500.00", "Credit", "Asha", "a@b.in", ...Array(10).fill(""), "SALT"].join("|")));
  // the five optional fields sit between the e-mail and the salt
  assert.equal(requestHash({ ...fields, udf1: "x" }, "SALT"), sha(["K", "T1", "500.00", "Credit", "Asha", "a@b.in", "x", ...Array(9).fill(""), "SALT"].join("|")));
});

test("the reply hash runs backwards and a changed amount or status is caught", () => {
  const reply = { status: "success", txnid: "T1", amount: "500.00", productinfo: "Credit", firstname: "Asha", email: "a@b.in", key: "K" };
  const expected = sha(["SALT", "success", ...Array(10).fill(""), "a@b.in", "Asha", "Credit", "500.00", "T1", "K"].join("|"));
  assert.equal(responseHash(reply, "SALT"), expected);
  assert.equal(responseHashIsValid({ ...reply, hash: expected }, "SALT"), true);
  assert.equal(responseHashIsValid({ ...reply, hash: expected, amount: "5000.00" }, "SALT"), false);
  assert.equal(responseHashIsValid({ ...reply, hash: expected, status: "failure" }, "SALT"), false);
  assert.equal(responseHashIsValid({ ...reply, hash: expected }, "OTHER"), false);
  assert.equal(responseHashIsValid({ ...reply }, "SALT"), false);
});

test("additional charges, when PayU adds them, come first in the reply hash", () => {
  const reply = { status: "success", txnid: "T1", amount: "500.00", productinfo: "Credit", firstname: "Asha", email: "a@b.in", key: "K", additionalCharges: "12.50" };
  assert.equal(responseHash(reply, "SALT"), sha(["12.50", "SALT", "success", ...Array(10).fill(""), "a@b.in", "Asha", "Credit", "500.00", "T1", "K"].join("|")));
});

test("amounts are written with two decimals and invoices follow the client number", () => {
  assert.equal(formatAmount(50000), "500.00");
  assert.equal(formatAmount(12345), "123.45");
  assert.equal(formatInvoiceCode("BPML/2026/NR001", 3), "BPML/2026/NR001/INV0003");
});
