import assert from "node:assert/strict";
import test from "node:test";
import { arabicServiceCategoryName, serviceCategoryCreationSchema } from "./service-category-names";

test("Arabic-only category creation needs no English key and generates unique stable identifiers", () => {
  const first = serviceCategoryCreationSchema.parse({ labelAr: " تصوير مناسبات " });
  const second = serviceCategoryCreationSchema.parse({ labelAr: "تصوير مناسبات" });
  assert.equal(first.labelAr, "تصوير مناسبات");
  assert.match(first.key, /^service_[a-f0-9]{32}$/);
  assert.notEqual(first.key, second.key);
  assert.equal(serviceCategoryCreationSchema.parse({ key: "photography", labelAr: "تصوير" }).key, "photography");
  for (const label of ["photography", "تصوير Photography", "", "   "]) {
    assert.equal(arabicServiceCategoryName.safeParse(label).success, false);
  }
  assert.equal(arabicServiceCategoryName.safeParse("ضيافة ومناسبات").success, true);
});
