import assert from "node:assert/strict";
import { it } from "node:test";
import { sameCityName } from "./city-name";

it("matches catalog, URL and property city names despite spelling differences", () => {
  assert.ok(sameCityName("الأسياح", " اَلْاِسياح "));
  assert.ok(sameCityName("عيون الجواء", "عيونالجواء"));
  assert.ok(sameCityName("بريدة", "بُريـدة"));
  assert.ok(sameCityName("Jeddah", "JEDDAH"));
  assert.ok(!sameCityName("الرس", "الرس الجديدة"));
  assert.ok(!sameCityName("بريدة", "عنيزة"));
  assert.ok(!sameCityName("", " "));
});