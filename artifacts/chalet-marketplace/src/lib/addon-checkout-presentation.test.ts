import assert from "node:assert/strict";
import test from "node:test";
import { addonCheckoutError, addonCheckoutMethods } from "./addon-checkout-presentation";

test("only configured gateway methods are offered, with saved-card consent remaining card-only", () => {
  assert.deepEqual(addonCheckoutMethods(true), ["creditcard"]);
  assert.deepEqual(addonCheckoutMethods(false), ["creditcard", "stcpay"]);
  assert.ok(!addonCheckoutMethods(false).includes("applepay"));
});

test("technical Apple Pay and gateway failures never appear in owner-facing errors", () => {
  for (const error of [
    "Apple Pay label is required",
    "Validate Merchat URL is required for Apple Pay",
    "Country is required for Apple Pay",
    "config.error.no_applepay_label",
    "Failed to fetch",
    "تعذّر الدفع: TypeError",
    "",
    null,
  ]) {
    assert.doesNotMatch(addonCheckoutError(error), /[a-z]/i);
    assert.match(addonCheckoutError(error), /قبل المحاولة مرة أخرى/);
  }
  assert.equal(addonCheckoutError("تعذّر تأكيد الدفع"), "تعذّر تأكيد الدفع");
});
