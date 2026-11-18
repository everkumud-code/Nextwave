import test from "node:test";
import assert from "node:assert/strict";
import { MAX_GAP_MS, MIN_GAP_MS, randomGapMs } from "./pacing";

test("every gap is between 10 and 90 seconds and they really differ", () => {
  const gaps = Array.from({ length: 500 }, () => randomGapMs());
  assert.ok(gaps.every(gap => gap >= MIN_GAP_MS && gap <= MAX_GAP_MS));
  assert.ok(new Set(gaps).size > 100);
  assert.equal(randomGapMs(() => 0), MIN_GAP_MS);
  assert.equal(randomGapMs(() => 0.999999999), MAX_GAP_MS);
});
