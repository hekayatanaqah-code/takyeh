import assert from "node:assert/strict";
import { test } from "node:test";
import { bestPropertyOffer, type DiscountOffer } from "./property-offer-pricing";
const offer: DiscountOffer = {
  id: 1, nameAr: "اختبار", startDate: "2026-10-01", endDate: "2026-10-31",
  weekdays: [0, 1, 2, 3, 4, 5, 6], discountType: "percent", value: 20, enabled: true,
};
test("percentage discounts the actual season/day price, rounded to halala", () => {
  assert.equal(bestPropertyOffer(1500, "2026-10-21", [offer]).price, 1200);
  assert.equal(bestPropertyOffer(100.99, "2026-10-21", [offer]).price, 80.79);
});
test("fixed and new-night prices are supported; only the best offer is used", () => {
  const result = bestPropertyOffer(1000, "2026-10-21", [
    offer, { ...offer, id: 2, discountType: "fixed", value: 250 },
    { ...offer, id: 3, discountType: "night_price", value: 600 },
  ]);
  assert.equal(result.price, 600);
  assert.equal(result.offerId, 3);
});
test("dates and weekdays are inclusive and disabled or unrelated offers do not apply", () => {
  for (const day of ["2026-10-01", "2026-10-31"]) assert.equal(bestPropertyOffer(1000, day, [offer]).price, 800);
  assert.equal(bestPropertyOffer(1000, "2026-11-01", [offer]).price, 1000);
  assert.equal(bestPropertyOffer(1000, "2026-10-21", [{ ...offer, weekdays: [0] }]).price, 1000);
  assert.equal(bestPropertyOffer(1000, "2026-10-21", [{ ...offer, enabled: false }]).offerId, null);
});
test("no fake strike-through or negative price, and ties have stable winners", () => {
  assert.equal(bestPropertyOffer(100, "2026-10-21", [{ ...offer, discountType: "night_price", value: 200 }]).offerId, null);
  assert.equal(bestPropertyOffer(100, "2026-10-21", [{ ...offer, discountType: "fixed", value: 200 }]).price, 0);
  assert.equal(bestPropertyOffer(100, "2026-10-21", [{ ...offer, id: 5 }, offer]).offerId, 1);
});
