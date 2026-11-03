import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveAdminAmenity } from "./adminAmenityUtils";

const uuid = "a18a6ee4-a01c-43ca-99f6-f757c9385bde";
const catalog = [
  { id: 91, key: `amenity_${uuid}`, labelAr: "جلسة خارجية مظللة", isActive: false },
  { id: uuid, key: "managed_amenity", labelAr: "غرفة ألعاب" },
  { id: 12, key: "pool", labelAr: "مسبح خاص للأطفال" },
];

test("managed Arabic names take precedence over keys and legacy defaults", () => {
  assert.equal(resolveAdminAmenity(`amenity_${uuid}`, catalog).ar, "جلسة خارجية مظللة");
  assert.equal(resolveAdminAmenity("pool", catalog).ar, "مسبح خاص للأطفال");
  assert.equal(resolveAdminAmenity("legacy:pool", [{ key: "legacy:pool", labelAr: "مسبح عائلي" }]).ar, "مسبح عائلي");
});

test("stored catalog identifiers also resolve to Arabic names", () => {
  assert.equal(resolveAdminAmenity("91", catalog).ar, "جلسة خارجية مظللة");
  assert.equal(resolveAdminAmenity(uuid, catalog).ar, "غرفة ألعاب");
});

test("legacy facilities and custom Arabic labels remain readable", () => {
  assert.equal(resolveAdminAmenity("pool").ar, "مسبح");
  assert.equal(resolveAdminAmenity("other:جلسة عائلية").ar, "جلسة عائلية");
  assert.equal(resolveAdminAmenity("موقف خاص").ar, "موقف خاص");
});

test("missing, loading and failed catalog states never expose identifiers or English", () => {
  for (const raw of [uuid, `amenity_${uuid}`, "unregistered_long_facility_key", "12345", "other:unknown_key", `مرفق ${uuid}`, ""]) {
    for (const entries of [undefined, []]) {
      const label = resolveAdminAmenity(raw, entries).ar;
      assert.match(label, /[\u0621-\u064A]/);
      assert.doesNotMatch(label, /[a-z]/i);
      assert.ok(!label.includes(uuid));
    }
  }
});

test("invalid catalog labels do not leak technical keys", () => {
  assert.equal(resolveAdminAmenity("bad_key", [{ key: "bad_key", labelAr: uuid }]).ar, "مرفق غير معرّف");
  assert.equal(resolveAdminAmenity("bad_key", [{ key: "bad_key", labelAr: "مرفق 00000000-0000-4000-8000-000000000001" }]).ar, "مرفق غير معرّف");
});

test("updated catalog names are reflected without changing stored keys", () => {
  const renamed = catalog.map(item => item.id === 91 ? { ...item, labelAr: "جلسة حديقة" } : item);
  assert.equal(resolveAdminAmenity(`amenity_${uuid}`, renamed).ar, "جلسة حديقة");
  assert.equal(catalog[0].key, `amenity_${uuid}`);
});
