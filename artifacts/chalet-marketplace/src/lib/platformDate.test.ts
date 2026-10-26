import assert from "node:assert/strict";
import { it } from "node:test";
import { formatDateWithHijri } from "./hijri";

it("shows Umm al-Qura first and explicit Gregorian second at Saudi midnight", () => {
  const date = "2026-10-25T21:05:00Z";
  const output = formatDateWithHijri(date);
  const [primary, secondary] = output.split(" — ");
  assert(primary.includes("١٤٤٨"));
  assert(secondary.includes("٢٠٢٦"));
  assert(secondary.includes("٢٦"));
  assert(secondary.endsWith(" م"));
  assert.notEqual(primary, secondary);
});

it("does not mutate ISO dates and handles invalid values safely", () => {
  const original = new Date("2026-10-26T09:00:00Z");
  const value = original.toISOString();
  assert(formatDateWithHijri(original).includes(" — "));
  assert.equal(original.toISOString(), value);
  assert.equal(formatDateWithHijri("invalid"), "");
});
