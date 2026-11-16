import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyMetaWebhookChallenge, verifyMetaWebhookSignature } from "./webhook-security";

test("Meta webhook challenge requires subscribe mode and the exact verification token", () => {
  assert.equal(verifyMetaWebhookChallenge("subscribe", "verify-me", "challenge-123", "verify-me"), true);
  assert.equal(verifyMetaWebhookChallenge("subscribe", "wrong", "challenge-123", "verify-me"), false);
  assert.equal(verifyMetaWebhookChallenge("unsubscribe", "verify-me", "challenge-123", "verify-me"), false);
  assert.equal(verifyMetaWebhookChallenge("subscribe", "verify-me", "", "verify-me"), false);
  assert.equal(verifyMetaWebhookChallenge("subscribe", "verify-me", "challenge-123", ""), false);
});

test("Meta webhook signature verifies the exact raw body and rejects tampering", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  const secret = "test-app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
  assert.equal(verifyMetaWebhookSignature(body, signature, secret), true);
  assert.equal(verifyMetaWebhookSignature(`${body} `, signature, secret), false);
  assert.equal(verifyMetaWebhookSignature(body, signature, "wrong-secret"), false);
  assert.equal(verifyMetaWebhookSignature(body, "", secret), false);
});
