import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildInsuranceReport, insuranceAmounts, canSettleInsurance, filterInsuranceEntries, insuranceCheckoutTime, type InsuranceEntry } from "./insuranceReport";
import { archiveTotals, createArchiveWorkbook, SAR_ACCOUNTING_FORMAT } from "./bookingArchiveExport";
import { buildArchivePdfPage } from "./bookingArchivePdf";
import type { ArchiveReportContext } from "./bookingArchiveReport";

const entry: InsuranceEntry = {
  id: 1, clientName: "عميل", clientPhone: "0501234567", bookingDate: "2026-10-16",
  durationDays: 1, insuranceFee: "500.50", insuranceReceived: true, insuranceRefunded: false,
  checkoutAt: "2026-10-17T03:00:00Z", chaletTitle: "عقار", submissionId: 4,
};
const context: ArchiveReportContext = {
  propertyNames: ["عقار"], ownerName: "مالك", ownerPhone: "0500000000",
  platformLogoUrl: "/logo.png", calendarPreference: "hijri", issuedAt: "2026-10-17T12:00:00Z",
};
describe("insurance report and checkout governance", () => {
  it("locks before the exact Saudi checkout instant, unlocking only at it; missing/cancelled/settled entries stay locked", () => {
    const time = Date.parse(entry.checkoutAt!);
    assert.equal(canSettleInsurance(entry, time - 1), false);
    assert.equal(canSettleInsurance(entry, time), true);
    assert.equal(insuranceCheckoutTime(entry.checkoutAt), "٠٦:٠٠ ص");
    for (const changed of [{ checkoutAt: null }, { checkoutAt: "invalid" }, { cancelledAt: "2026-10-16" }, { insuranceRefunded: true }]) {
      assert.equal(canSettleInsurance({ ...entry, ...changed }, time + 1), false);
    }
  });
  it("never calls unreceived insurance held cash; separates partial/full deductions and registered refunds", () => {
    assert.deepEqual(insuranceAmounts(entry), { required: 500.5, received: 500.5, deducted: 0, held: 500.5, returned: 0 });
    assert.equal(insuranceAmounts({ ...entry, insuranceReceived: false }).held, 0);
    assert.equal(insuranceAmounts({ ...entry, insuranceReceived: null }).received, 0);
    assert.deepEqual(insuranceAmounts({ ...entry, insuranceRefunded: true, insuranceDeducted: "125.25" }),
      { required: 500.5, received: 500.5, deducted: 125.25, held: 0, returned: 375.25 });
    assert.equal(insuranceAmounts({ ...entry, insuranceRefunded: true, insuranceDeducted: "500.50" }).returned, 0);
    assert.throws(() => insuranceAmounts({ ...entry, insuranceDeducted: "501" }));
    assert.throws(() => insuranceAmounts({ ...entry, insuranceFee: "invalid" }));
  });
  it("uses the same filters for the full export as the screen, not its ten-row page", () => {
    const entries = Array.from({ length: 23 }, (_, index) => ({ ...entry, id: index + 1 }));
    const filters = { status: "all" as const, month: "2026-10", year: "", chalet: "4", search: "٠٥٠١", calendar: "gregorian" as const };
    assert.equal(filterInsuranceEntries(entries, filters).length, 23);
    assert.equal(buildInsuranceReport(filterInsuranceEntries(entries, filters), "hijri").rows.length, 23);
    assert.equal(filterInsuranceEntries(entries, { ...filters, month: "2026-09" }).length, 0);
    assert.equal(filterInsuranceEntries(entries, { ...filters, status: "resolved" }).length, 0);
    assert.equal(filterInsuranceEntries(entries, { ...filters, chalet: "5" }).length, 0);
    assert.equal(filterInsuranceEntries(entries, { ...filters, calendar: "hijri", month: "", year: "1448" }).length, 23);
  });
  it("writes every financial field as Number with SUM totals, preserving audit reasons and both date calendars", async () => {
    const records = [entry, { ...entry, id: 2, insuranceRefunded: true, insuranceDeducted: "125.25", insuranceDeductReason: 'كسر الباب <script>bad</script>', insuranceProofImages: '["/proof1.png","/proof2.png"]' },
      { ...entry, id: 3, insuranceReceived: false }];
    const table = buildInsuranceReport(records, "hijri");
    const totals = archiveTotals(table);
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await createArchiveWorkbook(table, context));
    const sheet = workbook.getWorksheet("تقرير التأمينات")!;
    const headers = sheet.getRow(7).values as string[];
    for (const original of table.numericColumns) {
      const column = headers.indexOf(table.headers[original]);
      for (let row = 0; row < records.length; row++) {
        const cell = sheet.getRow(8 + row).getCell(column);
        assert.equal(cell.type, ExcelJS.ValueType.Number);
        assert.equal(cell.value, table.rows[row][original]);
        assert.equal(cell.numFmt, SAR_ACCOUNTING_FORMAT);
      }
      const total = sheet.getRow(sheet.rowCount).getCell(column);
      assert(total.formula.startsWith("SUM("));
      assert.equal(total.result, totals[original]);
    }
    assert.equal(sheet.views[0].rightToLeft, true);
    assert(headers.includes("تاريخ الخروج (هجري)") && headers.includes("تاريخ الخروج (ميلادي)"));
    const html = buildArchivePdfPage({ table, context, rows: table.rows, includeSummary: true, pageNumber: 1, totalPages: 1, width: 1900 });
    assert(html.includes("تقرير التأمينات: عقار"));
    assert(html.includes("كسر الباب &lt;script&gt;bad&lt;/script&gt;"));
    assert(html.includes("2 صورة"));
    assert.equal((html.match(/data-booking-row=/g) ?? []).length, 3);
    assert.equal(totals[9], 500.5);
    assert.equal(totals[10], 125.25);
    assert.equal(totals[11], 375.25);
  });
});
