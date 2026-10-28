import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampPage, filterServiceContracts, paginate, serviceContractStatus, serviceMonthKey, serviceMonthOptions, serviceYearOptions } from "./serviceContractArchive";

const rows = [
  { id: 1, clientName: "سالم", clientPhone: "0551234567", dateStr: "2025-03-01", contractSigned: true },
  { id: 2, clientName: "نورة", clientPhone: "0509999999", dateStr: "2025-03-31", status: "cancelled", contractSigned: true },
  { id: 3, clientName: "فهد", clientPhone: null, dateStr: "2024-12-31" },
  { id: 4, clientName: "بلا تاريخ", dateStr: null },
];
const base = { search: "", cal: "gregorian" as const, year: "", month: "all", status: "all" as const };

describe("service contract archive", () => {
  it("cancelled wins over signature", () => {
    assert.equal(serviceContractStatus(rows[1]), "cancelled");
    assert.equal(serviceContractStatus(rows[0]), "signed");
    assert.equal(serviceContractStatus(rows[2]), "pending");
  });
  it("month keys use local dates without UTC shift", () => {
    assert.equal(serviceMonthKey("2024-12-31", "gregorian"), "2024-12");
    assert.equal(serviceMonthKey("2025-03-01", "hijri"), "1446-09");
    assert.equal(serviceMonthKey("2025-03-31", "hijri"), "1446-10");
    assert.equal(serviceMonthKey(null, "hijri"), null);
  });
  it("year/month options depend on calendar", () => {
    assert.deepEqual(serviceYearOptions(rows, "gregorian"), ["2025", "2024"]);
    assert.deepEqual(serviceYearOptions(rows, "hijri"), ["1446"]);
    assert.deepEqual(serviceMonthOptions(rows, "gregorian", "2025"), ["2025-03"]);
  });
  it("filters by year, month, status and sorts newest first", () => {
    assert.deepEqual(filterServiceContracts(rows, { ...base, year: "2025" }).map(r => r.id), [2, 1]);
    assert.deepEqual(filterServiceContracts(rows, { ...base, cal: "hijri", year: "1446", month: "1446-09" }).map(r => r.id), [1]);
    assert.deepEqual(filterServiceContracts(rows, { ...base, status: "cancelled" }).map(r => r.id), [2]);
  });
  it("Eastern Arabic digit search matches phone and id", () => {
    assert.deepEqual(filterServiceContracts(rows, { ...base, search: "٠٥٥١٢" }).map(r => r.id), [1]);
    assert.deepEqual(filterServiceContracts(rows, { ...base, search: "نورة" }).map(r => r.id), [2]);
  });
  it("page bounds clamp", () => {
    const many = Array.from({ length: 23 }, (_, i) => i);
    assert.equal(clampPage(9, 23), 3);
    assert.equal(clampPage(0, 0), 1);
    assert.deepEqual(paginate(many, 3), [20, 21, 22]);
    assert.deepEqual(paginate(many, 99), [20, 21, 22]);
  });
  it("does not roll malformed dates into another month", () => {
    for (const date of ["2025-02-30", "2025-13-01", "2025-00-10", "2025-03-01x", "invalid"]) {
      assert.equal(serviceMonthKey(date, "gregorian"), null);
    }
  });
  it("matches formatted phones but does not use digits from unrelated text searches", () => {
    assert.deepEqual(filterServiceContracts(rows, { ...base, search: "٠٥٥ ١٢٣" }).map(r => r.id), [1]);
    assert.deepEqual(filterServiceContracts(rows, { ...base, search: "غير موجود ٠٥٥" }), []);
  });
});
