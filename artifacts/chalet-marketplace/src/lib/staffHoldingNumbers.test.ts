import assert from "node:assert/strict";
import { test } from "node:test";
import { easternHoldingDigits, latinHoldingDigits } from "./staffHoldingNumbers";

test("amount editing always displays Eastern digits without rounding or dropping a decimal", () => {
  assert.equal(easternHoldingDigits("275.50"), "٢٧٥٫٥٠");
  assert.equal(easternHoldingDigits("۱۲.۳"), "١٢٫٣");
  assert.equal(easternHoldingDigits("٠٫"), "٠٫");
  assert.equal(easternHoldingDigits(""), "");
});

test("localized amounts round-trip to the same numeric API payload", () => {
  for (const amount of ["0", "275.50", "99999999.99", "0.01"]) {
    assert.equal(latinHoldingDigits(easternHoldingDigits(amount)), amount);
    assert.equal(Number(latinHoldingDigits(easternHoldingDigits(amount))), Number(amount));
  }
  assert.equal(latinHoldingDigits("١٢٣٫٤٥"), "123.45");
  assert.equal(latinHoldingDigits("۱۲۳.۴۵"), "123.45");
});
