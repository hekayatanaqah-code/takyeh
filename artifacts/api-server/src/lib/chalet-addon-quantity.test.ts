import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAddonQuantities } from "./chalet-addon-quantity";

const service = { id: 1, name: "أثاث", price: "12.50", unit: "لمرة واحدة", maxQuantity: 3 };
test("quantity caps reject excess, invalid quantities, duplicate IDs and foreign services", () => {
  for (const quantity of [4, 0, -1, 1.5, NaN, Infinity, 1000001]) {
    assert.throws(() => resolveAddonQuantities([service], [1], [{ id: 1, quantity }]));
  }
  assert.throws(() => resolveAddonQuantities([service], [1, 1]));
  assert.throws(() => resolveAddonQuantities([], [1]));
  assert.throws(() => resolveAddonQuantities([service], [1], [{ id: 2, quantity: 1 }]));
  assert.throws(() => resolveAddonQuantities([service], [1], [{ id: 1, quantity: 1 }, { id: 1, quantity: 2 }]));
});
test("legacy selection is one unit and multi-unit snapshots preserve accurate line totals and descriptions", () => {
  assert.equal(resolveAddonQuantities([service], [1])[0].price, "12.50");
  const row = resolveAddonQuantities([service], [1], [{ id: 1, quantity: 3 }])[0];
  assert.equal(row.price, "37.50");
  assert.equal(row.unitPrice, "12.50");
  assert.equal(row.quantity, 3);
  assert.match(row.name, /٣/);
  assert.equal(service.name, "أثاث");
});
test("zero blocks bookings, null removes the cap, and separate bookings do not consume each other's cap", () => {
  assert.throws(() => resolveAddonQuantities([{ ...service, maxQuantity: 0 }], [1]));
  assert.equal(resolveAddonQuantities([{ ...service, maxQuantity: null }], [1], [{ id: 1, quantity: 100 }])[0].quantity, 100);
  for (let booking = 0; booking < 2; booking++) assert.equal(resolveAddonQuantities([service], [1], [{ id: 1, quantity: 3 }])[0].quantity, 3);
});
