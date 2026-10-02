import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { normalizeCityName, normalizedCityExpression } from "./city-name";

const cases = [
  ["الأسياح", "الاسياح"],
  [" الإِسْياح ", "الاسياح"],
  ["آسياح", "اسياح"],
  ["عيون  الجواء", "عيونالجوا"],
  ["ع يون\tالجواء", "عيونالجوا"],
  ["الـرَّس", "الرس"],
  ["JEDDAH", "jeddah"],
  ["الخبراء", "الخبرا"],
  ["بريدة", "بريدة"],
  ["بُريدة\u00A0", "بريدة"],
  ["ؤئ", "وي"],
  ["\u200F الرس \u200B", "الرس"],
] as const;

describe("exact normalized city identity", () => {
  it("ignores hamza, whitespace, marks and case without substring matching", () => {
    for (const [input, expected] of cases) assert.equal(normalizeCityName(input), expected);
    assert.notEqual(normalizeCityName("الرس"), normalizeCityName("الرس الجديدة"));
    assert.notEqual(normalizeCityName("بريدة"), normalizeCityName("عنيزة"));
  });

  it("uses the same city identity in PostgreSQL and JavaScript", async () => {
    for (const [input, expected] of cases) {
      const result = await db.execute<{ normalized: string }>(sql`SELECT ${normalizedCityExpression(sql`${input}`)} AS normalized`);
      assert.equal(result.rows[0].normalized, expected, input);
    }
  });
});