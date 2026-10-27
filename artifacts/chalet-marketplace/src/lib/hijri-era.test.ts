import assert from "node:assert/strict";
import { it } from "node:test";
import { formatDualDate, withHijriEra } from "./hijri";

it("shows the Hijri era exactly once whether Intl included it or not", () => {
  for (const suffix of ["", " هـ", " هـ هـ", "هـ هـ", " هـ\u200f"]) {
    const label = withHijriEra(`١٦ جمادى الأولى ١٤٤٨${suffix}`);
    assert.equal(label, "١٦ جمادى الأولى ١٤٤٨ هـ");
    assert.equal(withHijriEra(label), label);
  }
});
it("normalizes an actual Intl Hijri date and leaves an empty date empty", () => {
  assert.equal(withHijriEra(""), "");
  assert.equal((withHijriEra(formatDualDate("2026-10-27").hijri).match(/هـ/g) ?? []).length, 1);
});
