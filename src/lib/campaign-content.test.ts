import test from "node:test";
import assert from "node:assert/strict";
import { campaignPin, contentProblem, hasContent, parsePinInput, templateParamIsValid, templateValues } from "./campaign-content";

test("a map pin is read from a request and checked", () => {
  assert.deepEqual(parsePinInput({ lat: "23.35", lng: 85.33, name: " Our shop ", address: "" }), { pin: { lat: 23.35, lng: 85.33, name: "Our shop", address: null } });
  assert.deepEqual(parsePinInput(null), { pin: null });
  for (const bad of [{ lat: 91, lng: 0 }, { lat: 0, lng: 181 }, { lat: "", lng: 5 }, { lat: "x", lng: 5 }, "text", [1, 2]]) assert.ok("error" in parsePinInput(bad), JSON.stringify(bad));
});

test("a campaign has content when it has text, a file, a pin or a template", () => {
  assert.equal(hasContent({}), false);
  assert.equal(hasContent({ messageBody: "  " }), false);
  assert.equal(hasContent({ messageBody: "hi" }), true);
  assert.equal(hasContent({ locationLat: 1, locationLng: 2 }), true);
  assert.equal(hasContent({ templateName: "offer" }), true);
  assert.deepEqual(campaignPin({ locationLat: 1, locationLng: 2, locationName: "X" }), { lat: 1, lng: 2, name: "X", address: null });
});

test("what an ordinary (QR) number may send", () => {
  assert.match(contentProblem({}, "QR_SESSION") ?? "", /Add a message/);
  assert.equal(contentProblem({ messageBody: "hi" }, "QR_SESSION"), null);
  assert.equal(contentProblem({ locationLat: 1, locationLng: 2 }, "QR_SESSION"), null);
  assert.match(contentProblem({ mediaAssetId: "m", locationLat: 1, locationLng: 2 }, "QR_SESSION") ?? "", /either a file or a location/);
  assert.match(contentProblem({ templateName: "offer" }, "QR_SESSION") ?? "", /Add a message/);
});

test("what an official (Meta) number may send: only an approved template", () => {
  assert.match(contentProblem({ messageBody: "hi" }, "META_CLOUD_API") ?? "", /approved template/);
  assert.equal(contentProblem({ templateName: "offer" }, "META_CLOUD_API"), null);
  assert.match(contentProblem({ templateName: "offer", messageBody: "also this" }, "META_CLOUD_API") ?? "", /remove the free text/);
});

test("template variables come from contact fields, extra fields or fixed words; empty ones become a dash", () => {
  assert.equal(templateParamIsValid("firstName"), true);
  assert.equal(templateParamIsValid("city|there"), true);
  assert.equal(templateParamIsValid("text:Diwali sale"), true);
  assert.equal(templateParamIsValid("text:"), false);
  assert.equal(templateParamIsValid("1 bad"), false);
  const contact = { firstName: "Asha", company: "", custom: { city: "Pune" } };
  assert.deepEqual(templateValues(["firstName", "city", "company", "company|your shop", "text:20% off"], contact), ["Asha", "Pune", "-", "your shop", "20% off"]);
});
