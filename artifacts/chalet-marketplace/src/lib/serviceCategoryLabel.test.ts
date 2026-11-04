import assert from "node:assert/strict";
import test from "node:test";
import { arabicServiceCategoryLabel, isArabicServiceCategoryName } from "./serviceCategoryLabel";

test("service categories show Arabic labels without exposing internal or English names", () => {
  assert.equal(arabicServiceCategoryLabel(" تصوير مناسبات "), "تصوير مناسبات");
  for (const value of ["photography", "service_a1b2c3", "حلويات cakes", null, ""]) {
    assert.equal(arabicServiceCategoryLabel(value), "فئة غير محددة");
  }
  assert.equal(isArabicServiceCategoryName("حلويات وضيافة"), true);
  assert.equal(isArabicServiceCategoryName("cakes"), false);
  assert.equal(isArabicServiceCategoryName("حلويات Cakes"), false);
});
