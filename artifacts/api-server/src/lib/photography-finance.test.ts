import { test } from "node:test";
import assert from "node:assert/strict";
import { validSaudiIban, ibanSchema, bankSchema, cleanContractHtml } from "./photography-finance";

test("Saudi IBAN checks actual checksum and normalizes Arabic digits and spacing", () => {
  assert.equal(validSaudiIban("SA0380000000608010167519"), true);
  assert.equal(validSaudiIban("SA0380000000608010167518"), false);
  assert.equal(validSaudiIban("AE0380000000608010167519"), false);
  assert.equal(ibanSchema.parse("sa٠٣ ٨٠٠٠ ٠٠٠٠ ٦٠٨٠ ١٠١٦ ٧٥١٩"), "SA0380000000608010167519");
  assert.equal(bankSchema.safeParse("الراجحي").success, true);
  assert.equal(bankSchema.parse("  بنك مخصص  "), "بنك مخصص");
  assert.equal(bankSchema.safeParse("بنك آخر").success, false);
  assert.equal(bankSchema.safeParse(" ").success, false);
  assert.equal(bankSchema.safeParse("x".repeat(121)).success, false);
});
test("published rich-text contracts strip scripts, handlers and unsafe links", () => {
  const html = cleanContractHtml('<h2>شروط</h2><p onclick="bad()">نص <strong>عقد</strong></p><script>alert(1)</script><a href="javascript:bad()">رابط</a><img src=x onerror=bad()>');
  assert.match(html, /<h2>شروط<\/h2>/);
  assert.match(html, /<strong>عقد<\/strong>/);
  assert.doesNotMatch(html, /script|onclick|javascript|onerror|<img/);
});
