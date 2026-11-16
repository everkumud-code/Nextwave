import test from "node:test";
import assert from "node:assert/strict";
import { hasCurrentMarketingConsent } from "./campaign-audience-rules";

test("only the latest granted marketing consent is eligible", () => {
  assert.equal(hasCurrentMarketingConsent([{ status: "GRANTED" }]), true);
  assert.equal(hasCurrentMarketingConsent([{ status: "WITHDRAWN" }, { status: "GRANTED" }]), false);
  assert.equal(hasCurrentMarketingConsent([{ status: "UNKNOWN" }, { status: "GRANTED" }]), false);
  assert.equal(hasCurrentMarketingConsent([]), false);
});
