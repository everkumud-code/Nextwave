import test from "node:test";
import assert from "node:assert/strict";
import { dailyLimitForAge, daysSince, startOfLocalDay, startOfNextLocalDay } from "./daily-limit";

test("a new number is held to a small daily allowance that grows with its age", () => {
  assert.equal(dailyLimitForAge(0), 50);
  assert.equal(dailyLimitForAge(2.9), 50);
  assert.equal(dailyLimitForAge(3), 100);
  assert.equal(dailyLimitForAge(7), 200);
  assert.equal(dailyLimitForAge(14), 400);
  assert.equal(dailyLimitForAge(400), 400);
  assert.equal(dailyLimitForAge(-5), 50);
});

test("days since the first connection", () => {
  const first = new Date("2026-11-01T00:00:00Z");
  assert.equal(daysSince(first, new Date("2026-11-04T12:00:00Z")), 3.5);
  assert.equal(daysSince(first, new Date("2026-10-01T00:00:00Z")), 0);
});

test("the local day starts at midnight of the organisation's time zone", () => {
  const now = new Date("2026-11-17T20:00:00Z");           // 01:30 on 18 Nov in India
  assert.equal(startOfLocalDay(now, "Asia/Kolkata").toISOString(), "2026-11-17T18:30:00.000Z");
  assert.equal(startOfNextLocalDay(now, "Asia/Kolkata").toISOString(), "2026-11-18T18:30:00.000Z");
  assert.equal(startOfLocalDay(new Date("2026-11-17T10:00:00Z"), "UTC").toISOString(), "2026-11-17T00:00:00.000Z");
  assert.equal(startOfLocalDay(now, "Not/AZone").toISOString(), "2026-11-17T18:30:00.000Z");
});
