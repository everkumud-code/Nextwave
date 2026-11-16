import test from "node:test";
import assert from "node:assert/strict";
import { getRetryDecision } from "./retry-policy";

test("uses bounded exponential retry delays", () => {
  const now = new Date("2026-11-16T00:00:00.000Z");
  const first = getRetryDecision({ attemptCount: 1, maxAttempts: 5, errorCode: "TEMP", errorMessage: "temporary", now });
  const second = getRetryDecision({ attemptCount: 2, maxAttempts: 5, errorCode: "TEMP", errorMessage: "temporary", now });
  assert.equal(first.nextAttemptAt?.getTime(), now.getTime() + 30_000);
  assert.equal(second.nextAttemptAt?.getTime(), now.getTime() + 60_000);
});

test("caps retry delay and stops at max attempts", () => {
  const now = new Date("2026-11-16T00:00:00.000Z");
  const capped = getRetryDecision({ attemptCount: 20, maxAttempts: 30, errorCode: "TEMP", errorMessage: "temporary", now, maxDelayMs: 120_000 });
  assert.equal(capped.nextAttemptAt?.getTime(), now.getTime() + 120_000);
  const terminal = getRetryDecision({ attemptCount: 5, maxAttempts: 5, errorCode: "INVALID", errorMessage: "bad recipient", now });
  assert.equal(terminal.retry, false);
  assert.equal(terminal.nextAttemptAt, null);
});
