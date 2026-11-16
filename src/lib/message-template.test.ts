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
