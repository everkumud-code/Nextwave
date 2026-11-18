import test from "node:test";
import assert from "node:assert/strict";
import { findUnsupportedTemplateVariables, renderMessageTemplate } from "./message-template";

test("renders supported contact variables", () => {
  assert.equal(
    renderMessageTemplate("Hello {{firstName}}, from {{company}}. Reach {{phoneNumber}}", {
      firstName: "Asha", company: "Northwind", phoneNumber: "+919876543210",
    }),
    "Hello Asha, from Northwind. Reach +919876543210",
  );
});

test("reports unsupported variables and treats missing values as empty", () => {
  assert.deepEqual(findUnsupportedTemplateVariables("Hi {{firstName}} {{unknown}} {{unknown}}"), ["unknown"]);
  assert.equal(renderMessageTemplate("Hello {{firstName}} {{lastName}}", {}), "Hello  ");
});

test("a variable can carry what to write when it is empty", () => {
  assert.equal(renderMessageTemplate("Hello {{firstName|there}}!", { firstName: "" }), "Hello there!");
  assert.equal(renderMessageTemplate("Hello {{firstName|there}}!", { firstName: "Asha" }), "Hello Asha!");
  assert.equal(renderMessageTemplate("Hello {{ firstName | dear customer }}", {}), "Hello dear customer");
});

test("extra columns of the contact's row can be used in a message", () => {
  const contact = { firstName: "Asha", custom: { city: "Ranchi", amount: 1500, paid: false, nested: { x: 1 } } };
  assert.equal(renderMessageTemplate("{{firstName}} from {{city}} owes {{amount}}; paid: {{paid}}", contact), "Asha from Ranchi owes 1500; paid: false");
  assert.equal(renderMessageTemplate("{{city|your city}} / {{nested|none}} / {{missing|none}}", { custom: { city: "" , nested: { x: 1 } } }), "your city / none / none");
  assert.deepEqual(findUnsupportedTemplateVariables("{{city}} {{firstName}} {{oops}}", ["city"]), ["oops"]);
  assert.deepEqual(findUnsupportedTemplateVariables("{{city|x}}"), ["city"]);
});
