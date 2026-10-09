import assert from "node:assert/strict";
import { test } from "node:test";
import { whatsappDigits } from "./utils";

test("WhatsApp permits Western, Arabic and Persian numbers", () => {
  assert.equal(whatsappDigits("0512345678"), "0512345678");
  assert.equal(whatsappDigits("٠٥١٢٣٤٥٦٧٨"), "0512345678");
  assert.equal(whatsappDigits("۰۵۱۲۳۴۵۶۷۸"), "0512345678");
});

test("typing or pasting cannot leave letters or symbols in WhatsApp", () => {
  assert.equal(whatsappDigits("abc +966 (51) 234-5678"), "966512345678");
  assert.equal(whatsappDigits("حروف!@#"), "");
  assert.equal(whatsappDigits("٥a١b٢"), "512");
  assert.equal(whatsappDigits(""), "");
});
