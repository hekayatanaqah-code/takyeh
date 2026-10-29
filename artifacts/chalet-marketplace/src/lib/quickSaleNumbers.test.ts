import assert from "node:assert/strict";
import { test } from "node:test";
import { quickSaleNumericInput, quickSalePhone } from "./quickSaleNumbers";

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
