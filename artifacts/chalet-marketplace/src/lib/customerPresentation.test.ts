import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerDates } from "./customerPresentation";
import { fromAr, toAr } from "./utils";

describe("customer presentation", () => {
  it("shows both calendars with the owner's preference first and one era suffix each", () => {
    const hijri = customerDates("2026-10-17", "hijri")!;
    const gregorian = customerDates("2026-10-17", "gregorian")!;
    assert.deepEqual(gregorian, [...hijri].reverse());
    assert.equal(hijri[0].match(/هـ/g)?.length, 1);
    assert.equal(gregorian[0].match(/ م$/g)?.length, 1);
    for (const label of [...hijri, ...gregorian]) {
      assert(!/[0-9]/.test(label));
      assert(/[٠-٩]/.test(label));
    }
  });
  it("does not invent a date for missing or invalid records", () => {
    for (const value of ["", null, undefined, "invalid"]) {
      assert.equal(customerDates(value, "hijri"), null);
    }
  });
  it("displays phone digits in Arabic while retaining editable machine-readable values", () => {
    for (const phone of ["0501234567", "+966501234567", "٠٥٠١٢٣٤٥٦٧"]) {
      const displayed = toAr(phone);
      assert(!/[0-9]/.test(displayed));
      assert.equal(fromAr(displayed), fromAr(phone));
      assert.equal(toAr(displayed), displayed);
    }
    assert.equal(fromAr("٠٥٠١٢٣٤٥٦٧"), "0501234567");
    assert.equal(toAr(undefined), "");
  });
});
