import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emptyInventoryFilters, filterAndSortInventory, propertyPricingMode, uniqueFilterOptions, type InventoryDescriptor } from "./inventory-filters";
const rows: InventoryDescriptor[] = [
  { id: 1, name: "عقار أ", region: "القصيم", city: "الرس", category: "فئة جديدة", status: "active", pricing: "daily", createdAt: "2026-01-01" },
  { id: 2, name: "عقار ب", region: "القصيم", city: "عنيزة", category: "شالية", status: "paused", pricing: "period", createdAt: "2026-02-01" },
  { id: 3, name: "خدمة جديدة", region: "الرياض", city: "الرياض", category: "custom-service", status: "published", pricing: "per_hour", createdAt: "2026-03-01" },
];
const filter = (overrides = {}) => filterAndSortInventory(rows, { ...emptyInventoryFilters(), ...overrides }, row => row).map(row => row.id);
describe("inventory filters", () => {
  it("combines multiple cities/categories with OR within and AND across groups", () => {
    assert.deepEqual(filter({ regions: ["القصيم"], cities: ["الرس", "عنيزة"], categories: ["فئة جديدة", "شالية"] }), [2, 1]);
    assert.deepEqual(filter({ cities: ["الرس", "عنيزة"], statuses: ["active", "paused"], pricing: ["daily"] }), [1]);
    assert.deepEqual(filter({ cities: ["الرس"], categories: ["custom-service"] }), []);
  });
  it("supports dynamic and legacy categories without fixed enums", () => {
    assert.deepEqual(filter({ categories: ["custom-service"] }), [3]);
    const options = uniqueFilterOptions([{ value: "فئة جديدة", label: "فئة جديدة" }, { value: " قديمة ", label: "قديمة" }, { value: "قديمة", label: "مكرر" }]);
    assert.equal(options.length, 2);
  });
  it("preserves distinct service category identifiers instead of normalizing their keys", () => {
    const keyed = rows.slice(0, 2).map((row, index) => ({ ...row, category: index ? "Foo" : "foo", categoryIsIdentifier: true }));
    const result = filterAndSortInventory(keyed, { ...emptyInventoryFilters(), categories: ["Foo"] }, row => row);
    assert.deepEqual(result.map(row => row.id), [2]);
    assert.equal(uniqueFilterOptions([{ value: "Foo", label: "أ" }, { value: "foo", label: "ب" }], true).length, 2);
  });
  it("searches with hamza/space normalization and never mutates inventory", () => {
    assert.deepEqual(filter({ cities: [" اَلـرَّس "] }), [1]);
    assert.deepEqual(filter({ search: "خدمةجديدة" }), [3]);
    assert.deepEqual(rows.map(row => row.id), [1, 2, 3]);
  });
  it("resets all selections without dropping records and sorts deterministically", () => {
    assert.deepEqual(filter({ cities: ["مدينة بلا عقارات"] }), []);
    assert.deepEqual(filter(), [3, 2, 1]);
    assert.deepEqual(filter({ sort: "oldest" }), [1, 2, 3]);
    assert.deepEqual(filter({ sort: "status" }), [1, 2, 3]);
    assert.deepEqual(filter({ sort: "pricing" }), [1, 3, 2]);
  });
  it("derives property pricing from stored prices, including incomplete pending rows", () => {
    assert.equal(propertyPricingMode({ dailyPrices: { morning: { "1": 200 } } }), "daily");
    assert.equal(propertyPricingMode({ priceWeekend: "500" }), "weekday_weekend");
    assert.equal(propertyPricingMode({ priceFullDay: "400" }), "period");
    assert.equal(propertyPricingMode({ pricePerNight: "100" }), "per_night");
    assert.equal(propertyPricingMode({}), "unpriced");
  });
});