import assert from "node:assert/strict";
import { test } from "node:test";
import { customerHistorySearch } from "./customerHistoryFilters";
import { toHijriComponents } from "./hijri";
import { archiveDateRange, archivePageNumbers, EMPTY_ARCHIVE_FILTERS } from "./bookingArchive";

test("customer search accepts Gregorian dates in either order and digit set", () => {
  for (const value of ["17/10/2026", "٢٠٢٦-١٠-١٧", "١٧/١٠/٢٠٢٦ م", "2026/10/17"]) {
    assert.equal(customerHistorySearch(value), "2026-10-17");
  }
});
test("customer search converts a complete Hijri date without changing booking IDs", () => {
  const h = toHijriComponents(new Date("2026-10-17T12:00:00"));
  assert.equal(customerHistorySearch(`${h.day}/${h.month}/${h.year} هـ`), "2026-10-17");
  assert.equal(customerHistorySearch(" #٢٧٠ "), "#270");
  assert.equal(customerHistorySearch("١٤٤٨"), "1448");
  assert.equal(customerHistorySearch("٢٠٢٦-١٠"), "2026-10");
  assert.equal(customerHistorySearch("99/99/2026"), "99/99/2026");
});
test("quick periods respect the selected calendar and large histories have bounded page controls", () => {
  const now = Date.parse("2026-10-17T12:00:00Z");
  const gregorian = archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "this-month" }, now, "gregorian");
  assert.deepEqual(gregorian, { from: "2026-10-01", to: "2026-10-31" });
  const hijri = archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "this-month" }, now, "hijri");
  assert.notDeepEqual(hijri, gregorian);
  assert(archivePageNumbers(5000, 100000).length <= 7);
});
