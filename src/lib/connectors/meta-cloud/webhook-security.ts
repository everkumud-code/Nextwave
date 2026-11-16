import { createHmac, timingSafeEqual } from "node:crypto";

function constantTimeEqual(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyMetaWebhookChallenge(mode: string | null, token: string, challenge: string, expectedToken: string) {
  return Boolean(expectedToken && challenge && mode === "subscribe" && constantTimeEqual(token, expectedToken));
}

export function verifyMetaWebhookSignature(rawBody: string, signature: string, appSecret: string) {
  if (!appSecret || !signature) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  return constantTimeEqual(signature, expected);
}
