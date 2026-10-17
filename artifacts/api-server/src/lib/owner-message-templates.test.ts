import { test } from "node:test";
import assert from "node:assert/strict";
import { readOwnerMessageTemplates } from "./owner-message-templates";

test("legacy custom templates survive the named-template storage transition", () => {
  const customTemplates = [{ id: "a", title: "خاص", body: "صياغة المالك {اسم_العقار}" }];
  const old = readOwnerMessageTemplates(JSON.stringify(customTemplates));
  assert.deepEqual(old, { customTemplates, detailedReceiptTemplate: null });
  const saved = { ...old, detailedReceiptTemplate: "إيصالي\n{الشروط_والأحكام}" };
  assert.deepEqual(readOwnerMessageTemplates(JSON.stringify(saved)), saved);
});

test("missing or malformed historical settings have explicit empty defaults", () => {
  for (const raw of [null, undefined, "", "{broken", "null", "{}"]) {
    assert.deepEqual(readOwnerMessageTemplates(raw), { customTemplates: [], detailedReceiptTemplate: null });
  }
});

test("empty receipt text is retained instead of silently replaced", () => {
  assert.equal(readOwnerMessageTemplates('{"customTemplates":[],"detailedReceiptTemplate":""}').detailedReceiptTemplate, "");
});
