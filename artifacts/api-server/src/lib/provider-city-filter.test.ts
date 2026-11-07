import { test } from "node:test";
import assert from "node:assert/strict";
import { providerCoversCity, shuffledInventory } from "./provider-city-filter";

test("direct city, coverage, nationwide, absent coverage and exact matching", () => {
  const nationwide = "جميع مناطق المملكة";
  const item = { city: "بريدة", coverageTags: ["عنيزة", "Riyadh"] };
  assert.equal(providerCoversCity(item, "بريدة", nationwide), true);
  assert.equal(providerCoversCity(item, "عنيزة", nationwide), true);
  assert.equal(providerCoversCity(item, "riyadh", nationwide), true);
  assert.equal(providerCoversCity(item, "عنيز", nationwide), false);
  assert.equal(providerCoversCity({ city: null, coverageTags: [nationwide] }, "جدة", nationwide), true);
  assert.equal(providerCoversCity({ city: null, coverageTags: null }, "جدة", nationwide), false);
  assert.equal(providerCoversCity(item, "all", nationwide), true);
  assert.equal(providerCoversCity(item, undefined, nationwide), true);
});
test("shuffle preserves inventory without mutating the input", () => {
  const items = Object.freeze([1, 2, 3, 4, 5]);
  assert.deepEqual(shuffledInventory(items).sort(), [...items]);
  assert.deepEqual(shuffledInventory([]), []);
  assert.deepEqual(items, [1, 2, 3, 4, 5]);
});
