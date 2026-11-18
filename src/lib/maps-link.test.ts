import test from "node:test";
import assert from "node:assert/strict";
import { isShortMapsLink, parseMapsLink } from "./maps-link";

test("coordinates are found in the usual Google Maps addresses", () => {
  assert.deepEqual(parseMapsLink("https://www.google.com/maps/place/Ranchi/@23.3441,85.3096,13z/data=!3m1"), { lat: 23.3441, lng: 85.3096 });
  assert.deepEqual(parseMapsLink("https://www.google.com/maps/place/X/data=!3d23.5!4d85.25"), { lat: 23.5, lng: 85.25 });
  assert.deepEqual(parseMapsLink("https://maps.google.com/?q=23.35,85.33"), { lat: 23.35, lng: 85.33 });
  assert.deepEqual(parseMapsLink("https://maps.google.com/?q=-33.86%2C151.21"), { lat: -33.86, lng: 151.21 });
  assert.deepEqual(parseMapsLink(" 23.3441, 85.3096 "), { lat: 23.3441, lng: 85.3096 });
});

test("anything else is not guessed", () => {
  assert.equal(parseMapsLink(""), null);
  assert.equal(parseMapsLink("https://example.com/shop"), null);
  assert.equal(parseMapsLink("95.0, 10.0"), null);
  assert.equal(isShortMapsLink("https://maps.app.goo.gl/abc123"), true);
  assert.equal(isShortMapsLink("https://www.google.com/maps/@1,2,3z"), false);
});
