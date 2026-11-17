import test from "node:test";
import assert from "node:assert/strict";
import { FAILURE_LIMIT, FAILURE_WINDOW, shouldPauseForFailures } from "./auto-pause";

const ok = { status: "DELIVERED", errorCode: null };
const failed = { status: "FAILED", errorCode: "CONNECTOR_ERROR" };

test("does not pause before there are enough finished messages to judge", () => {
  assert.equal(shouldPauseForFailures(Array.from({ length: FAILURE_WINDOW - 1 }, () => failed)), false);
});

test("pauses when half of the last ten ended in a delivery failure", () => {
  const recent = [...Array.from({ length: FAILURE_LIMIT }, () => failed), ...Array.from({ length: FAILURE_WINDOW - FAILURE_LIMIT }, () => ok)];
  assert.equal(shouldPauseForFailures(recent), true);
});

test("does not pause on a few failures among many successes", () => {
  const recent = [failed, failed, ...Array.from({ length: 8 }, () => ok)];
  assert.equal(shouldPauseForFailures(recent), false);
});

test("withdrawn consent and bad data are not held against the number", () => {
  const recent = [...Array.from({ length: 8 }, () => ({ status: "FAILED", errorCode: "CONSENT_REVOKED" })), ...Array.from({ length: 10 }, () => ok)];
  assert.equal(shouldPauseForFailures(recent), false);
});
