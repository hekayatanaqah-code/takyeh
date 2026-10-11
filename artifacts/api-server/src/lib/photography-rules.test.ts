import assert from "node:assert/strict";
import { test } from "node:test";
import { availabilitySchema, coverageSchema, photoPhone, photographyQuote, photographySlots, photographerProfileSchema } from "./photography-rules";

test("profile details validate experience, safe portfolio links, and managed portrait paths", () => {
  const profile = {
    bio: "مصور عقارات", regionId: 1, cityId: 1, districtIds: [], allDistricts: true,
    sessionMinutes: 90, availability: [{ weekday: 0, start: "09:00", end: "17:00" }],
  };
  assert.equal(photographerProfileSchema.safeParse(profile).success, true);
  for (const experienceYears of ["", "under_1", "1_3", "3_5", "over_5"]) {
    assert.equal(photographerProfileSchema.safeParse({ ...profile, experienceYears }).success, true);
  }
  for (const portfolioUrl of ["", "https://www.behance.net/example", "https://instagram.com/example", "http://example.com"]) {
    assert.equal(photographerProfileSchema.safeParse({ ...profile, portfolioUrl }).success, true);
  }
  for (const portfolioUrl of ["not-a-url", "javascript:alert(1)", "ftp://example.com", "https://username:password@example.com"]) {
    assert.equal(photographerProfileSchema.safeParse({ ...profile, portfolioUrl }).success, false);
  }
  assert.equal(photographerProfileSchema.safeParse({ ...profile, experienceYears: "100" }).success, false);
  assert.equal(photographerProfileSchema.safeParse({ ...profile, profileImagePath: "https://example.com/a.svg" }).success, false);
  assert.equal(photographerProfileSchema.safeParse({ ...profile, profileImagePath: "/objects/uploads/00000000-0000-0000-0000-000000000000.webp" }).success, true);
  const cleared = photographerProfileSchema.parse({ ...profile, experienceYears: "", portfolioUrl: "", profileImagePath: "", whatsapp: "0712345678" });
  assert.equal(cleared.profileImagePath, "");
  assert.equal("whatsapp" in cleared, false, "invite identity cannot be supplied by the form");
});

test("Saudi phones accept both digit sets and reject invalid destinations", () => {
  assert.equal(photoPhone("٠٥٠١٢٣٤٥٦٧"), "966501234567");
  assert.equal(photoPhone("+966 50 123 4567"), "966501234567");
  assert.equal(photoPhone("00966501234567"), "966501234567");
  assert.equal(photoPhone("not-a-phone"), null);
});
test("weekly availability rejects reversed times, empty schedules and overlaps", () => {
  assert.equal(availabilitySchema.safeParse([]).success, false);
  assert.equal(availabilitySchema.safeParse([{ weekday: 0, start: "12:00", end: "11:00" }]).success, false);
  assert.equal(availabilitySchema.safeParse([
    { weekday: 0, start: "10:00", end: "12:00" }, { weekday: 0, start: "11:00", end: "13:00" },
  ]).success, false);
  assert.equal(availabilitySchema.safeParse([
    { weekday: 0, start: "10:00", end: "12:00" }, { weekday: 0, start: "12:00", end: "13:00" },
  ]).success, true);
});
test("coverage requires explicit districts or all-district coverage", () => {
  const base = { regionId: 1, cityId: 2, districtIds: [] };
  assert.equal(coverageSchema.safeParse({ ...base, allDistricts: false }).success, false);
  assert.equal(coverageSchema.safeParse({ ...base, allDistricts: true }).success, true);
});
test("price snapshots preserve every halala after percentage rounding", () => {
  assert.deepEqual(photographyQuote(19999, 12.5), { priceHalalas: 19999, commissionHalalas: 2500, photographerEarningsHalalas: 17499 });
  assert.deepEqual(photographyQuote(100, 100), { priceHalalas: 100, commissionHalalas: 100, photographerEarningsHalalas: 0 });
});
test("slots use Saudi local weekdays and exclude overlaps, past days and invalid dates", () => {
  const availability = [{ weekday: 0, start: "09:00", end: "12:00" }];
  const now = new Date("2026-10-10T00:00:00Z");
  const slots = photographySlots("2026-10-11", 60, availability, [
    { startAt: new Date("2026-10-11T06:30:00Z"), endAt: new Date("2026-10-11T07:30:00Z") },
  ], now);
  assert.deepEqual(slots, [{ startAt: "2026-10-11T08:00:00.000Z", endAt: "2026-10-11T09:00:00.000Z" }]);
  assert.equal(photographySlots("2026-02-30", 60, availability, [], now).length, 0);
  assert.equal(photographySlots("2026-10-04", 60, availability, [], now).length, 0);
  assert.equal(photographySlots("2027-10-10", 60, availability, [], now).length, 0);
});
