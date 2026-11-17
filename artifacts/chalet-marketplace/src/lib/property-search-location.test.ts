import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { getRegionCities } from "./property-search-location";

const cities = [
  { id: 1, name: "بريدة", regionId: 3 },
  { id: 2, name: "عنيزة", regionId: 3 },
  { id: 3, name: "الرياض", regionId: 1 },
  { id: 4, name: "مدينة قديمة", regionId: null },
];

test("never shows cities before choosing a region", () => {
  assert.deepEqual(getRegionCities(cities, ""), []);
  assert.deepEqual(getRegionCities(cities, "null"), []);
});

test("filters cities by the chosen region without replacing their identities", () => {
  const filtered = getRegionCities(cities, "3");
  assert.deepEqual(filtered.map(city => city.name), ["بريدة", "عنيزة"]);
  assert.equal(filtered[0], cities[0]);
  assert.equal(cities.length, 4);
});

test("changing regions excludes the previous region and unassigned cities", () => {
  assert.deepEqual(getRegionCities(cities, "1"), [cities[2]]);
  assert.deepEqual(getRegionCities(cities, "999"), []);
  assert.deepEqual(getRegionCities([], "3"), []);
  assert.deepEqual(getRegionCities(cities, ""), []);
});

test("city selection requires a region and region changes reset both dependent fields", () => {
  const home = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
  assert.match(home, /value=\{searchCity\} disabled=\{!searchRegion \|\| citiesLoading \|\| citiesError \|\| regionCities\.length === 0\}/);
  assert.match(home, /setSearchRegion\(value\);\s*setSearchCity\(""\);\s*setSearchDistricts\(\[\]\)/);
  assert.match(home, /if \(!regions\.some\(\(region\) => String\(region\.id\) === searchRegion\)\)/);
  assert(home.includes("اختر المنطقة أولاً"));
  assert(home.includes('const cityOk = !!selectedCityId;'));
});

const source = ts.createSourceFile("Home.tsx",
  readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function attribute(element: ts.JsxElement, name: string): string | undefined {
  const attr = element.openingElement.attributes.properties.find(
    (item): item is ts.JsxAttribute => ts.isJsxAttribute(item) && item.name.getText(source) === name,
  );
  return attr?.initializer && ts.isStringLiteral(attr.initializer) ? attr.initializer.text : undefined;
}

function row(testId: string): ts.JsxElement {
  let found: ts.JsxElement | undefined;
  function walk(node: ts.Node) {
    if (ts.isJsxElement(node) && attribute(node, "data-testid") === testId) found = node;
    ts.forEachChild(node, walk);
  }
  walk(source);
  assert(found, `Missing search row ${testId}`);
  return found;
}

test("both RTL rows have four equal-size fields and four desktop columns", () => {
  for (const testId of ["property-search-location-row", "property-search-booking-row"]) {
    const element = row(testId);
    assert.equal(attribute(element, "dir"), "rtl");
    assert.match(attribute(element, "className")!, /md:grid-cols-4/);
    const fields = element.children.filter(ts.isJsxElement);
    assert.equal(fields.length, 4);
    for (const field of fields) {
      assert.match(attribute(field, "className")!, /\bh-20\b/);
      assert.doesNotMatch(attribute(field, "className")!, /col-span/);
    }
  }
});

test("the rows preserve the requested region-to-search reading order", () => {
  for (const [testId, labels] of [
    ["property-search-location-row", ["المنطقة", "المدينة", "الحي", "الفئة"]],
    ["property-search-booking-row", ["الفترة", "يوم الحجز", "عدد الأيام", "ابحث الآن"]],
  ] as const) {
    const fields = row(testId).children.filter(ts.isJsxElement);
    fields.forEach((field, index) => assert(field.getText(source).includes(labels[index])));
  }
});

test("the support button uses exactly the neighboring action-button styling", () => {
  const toolbar = readFileSync(new URL("../components/owner/OwnerToolbar.tsx", import.meta.url), "utf8");
  assert.match(toolbar, /variant="outline" className=\{actionClassName\} onClick=\{p\.onSupport\}/);
});
