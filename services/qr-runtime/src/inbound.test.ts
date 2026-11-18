import test from "node:test";
import assert from "node:assert/strict";
import { describeInbound } from "./inbound.js";

test("a reply is described by its words, or by a marker for a file", () => {
  assert.equal(describeInbound({ conversation: "  Yes please  " }), "Yes please");
  assert.equal(describeInbound({ extendedTextMessage: { text: "Call me" } }), "Call me");
  assert.equal(describeInbound({ imageMessage: { caption: "my order" } }), "[photo] my order");
  assert.equal(describeInbound({ imageMessage: {} }), "[photo]");
  assert.equal(describeInbound({ audioMessage: {} }), "[voice message]");
  assert.equal(describeInbound({ buttonsResponseMessage: { selectedDisplayText: "Interested" } }), "Interested");
  assert.equal(describeInbound(null), null);
  assert.equal(describeInbound({}), null);
});
