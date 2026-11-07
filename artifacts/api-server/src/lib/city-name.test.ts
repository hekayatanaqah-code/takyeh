import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCityName } from "./city-name";

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

  it("normalizes compatibility forms without using approximate SQL collation", () => {
    assert.equal(normalizeCityName("ﺑﺮﻳﺪﺓ"),normalizeCityName("بريدة"));
    assert.equal(normalizeCityName("ÉVRY"),normalizeCityName("E\u0301VRY"));
    assert.notEqual(normalizeCityName("ÉVRY"),"evry");
    assert.notEqual(normalizeCityName("ø"),normalizeCityName("o"));
  });
});