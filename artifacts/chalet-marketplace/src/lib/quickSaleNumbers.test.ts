import assert from "node:assert/strict";
import { test } from "node:test";
import { quickSaleNumericInput, quickSalePhone, quickSalePhoneInput } from "./quickSaleNumbers";

test("quantity and price inputs accept digits only and render Eastern Arabic numerals", () => {
  assert.equal(quickSaleNumericInput("12abc٣!"), "١٢٣");
  assert.equal(quickSaleNumericInput("١٢٫٣٤٥", true), "١٢٫٣٤");
  assert.equal(quickSaleNumericInput("1e2", true), "١٢");
  assert.equal(quickSaleNumericInput("٠٠٧"), "٠٠٧");
});

test("customer mobile normalizes local and international Saudi inputs", () => {
  assert.equal(quickSalePhone("٠٥٠١٢٣٤٥٦٧"), "0501234567");
  assert.equal(quickSalePhone("+966 50 123 4567"), "0501234567");
  assert.equal(quickSalePhone("٥٠١٢٣٤٥٦٧"), "0501234567");
});

test("the mobile field rejects letters and limits typed or pasted Arabic, Persian and Latin digits to ten", () => {
  assert.equal(quickSalePhoneInput("050123456789"), "٠٥٠١٢٣٤٥٦٧");
  assert.equal(quickSalePhoneInput("٠٥٠١٢٣٤٥٦٧٨٩"), "٠٥٠١٢٣٤٥٦٧");
  assert.equal(quickSalePhoneInput("۰۵۰۱۲۳۴۵۶۷۸۹"), "٠٥٠١٢٣٤٥٦٧");
  assert.equal(quickSalePhoneInput("abc٠٥٠ ١٢٣-٤٥٦٧xyz"), "٠٥٠١٢٣٤٥٦٧");
  assert.equal(quickSalePhoneInput("letters"), "");
});
