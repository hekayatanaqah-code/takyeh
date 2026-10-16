import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveDateRange, archivePageNumbers, archiveCalendarYear, archiveCalendarYears, EMPTY_ARCHIVE_FILTERS } from "./bookingArchive";
import { toHijriComponents } from "./hijri";
import { ARCHIVE_EXCEL_HEADER_ROW, SAR_ACCOUNTING_FORMAT, buildArchiveExportTable, createArchiveWorkbook } from "./bookingArchiveExport";
import type { ArchiveReportContext } from "./bookingArchiveReport";

const context: ArchiveReportContext = {
  propertyNames: ["شاليه الاختبار"], ownerName: "المالك التجريبي", ownerPhone: "0500000000",
  platformLogoUrl: "/logo.png", calendarPreference: "hijri",
  from: "2020-01-01", to: "2020-12-31", issuedAt: "2020-12-31T21:30:00Z",
};

describe("archive periods and numeric pagination", () => {
  it("uses Saudi month boundaries, including New Year and leap-year February", () => {
    const rollover = Date.parse("2026-12-31T22:00:00Z"); // January in Saudi Arabia
    assert.deepEqual(archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "this-month" }, rollover), { from: "2027-01-01", to: "2027-01-31" });
    assert.deepEqual(archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "last-month" }, rollover), { from: "2026-12-01", to: "2026-12-31" });
    assert.deepEqual(archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "last-month" }, Date.parse("2024-03-10")), { from: "2024-02-01", to: "2024-02-29" });
  });
  it("supports all dates, selected years and one-sided or inclusive custom ranges", () => {
    assert.deepEqual(archiveDateRange(EMPTY_ARCHIVE_FILTERS), {});
    assert.deepEqual(archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "year", year: "2024" }), { from: "2024-01-01", to: "2024-12-31" });
    assert.deepEqual(archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "custom", from: "2020-01-01" }), { from: "2020-01-01", to: undefined });
  });
  it("keeps numeric navigation bounded and shows first/last and adjacent pages", () => {
    assert.deepEqual(archivePageNumbers(1, 1), [1]);
    assert.deepEqual(archivePageNumbers(5, 12), [1, "gap", 4, 5, 6, "gap", 12]);
    assert.deepEqual(archivePageNumbers(1, 3), [1, 2, 3]);
  });
  it("uses Umm al-Qura month/year boundaries and rolls the previous month across Muharram", () => {
    const now = Date.parse("2026-10-17T01:00:00Z");
    const month = archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "this-month" }, now, "hijri");
    const first = toHijriComponents(new Date(month.from + "T12:00:00"));
    const last = toHijriComponents(new Date(month.to + "T12:00:00"));
    assert.equal(first.day, 1);
    assert([29, 30].includes(last.day));
    assert.equal(first.month, last.month);
    const year = archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "year", year: "1448" }, now, "hijri");
    const yearStart = toHijriComponents(new Date(year.from + "T12:00:00"));
    const yearEnd = toHijriComponents(new Date(year.to + "T12:00:00"));
    assert.deepEqual(yearStart, { year: 1448, month: 1, day: 1 });
    assert.equal(yearEnd.year, 1448);
    assert.equal(yearEnd.month, 12);
    const previous = archiveDateRange({ ...EMPTY_ARCHIVE_FILTERS, period: "last-month" }, Date.parse(year.from + "T12:00:00Z"), "hijri");
    assert.equal(toHijriComponents(new Date(previous.from + "T12:00:00")).year, 1447);
    assert.equal(toHijriComponents(new Date(previous.from + "T12:00:00")).month, 12);
    assert.equal(archiveCalendarYear("hijri", now), 1448);
    assert(archiveCalendarYears(["2025", "2026"], "hijri", now).includes("1447"));
    assert(!archiveCalendarYears(["2025", "2026"], "hijri", now).includes("2026"));
  });
});

describe("archive financial Excel export", () => {
  it("writes real RTL XLSX, preserving Arabic text, phone zeros, numeric money and safe string values", async () => {
    const bookings = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1, submissionId: 2, clientName: index === 0 ? "=HYPERLINK(\"bad\")" : "اسم عربي",
      clientPhone: "0501234567", bookingDate: "2020-01-01", durationDays: 1, period: "evening",
      totalPrice: "250.50", depositPaid: "100.25", balanceCollected: false, insuranceFee: "500",
      insuranceReceived: true, insuranceRefunded: false, insuranceDeducted: "0",
    }));
    const table = buildArchiveExportTable("completed", bookings, [], () => "شاليه الاختبار");
    assert.equal(table.rows.length, 12);
    assert.equal(table.rows[0][9], 150.25);
    const buffer = await createArchiveWorkbook(table, context);
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet(1)!;
    assert.equal(sheet.views[0].rightToLeft, true);
    assert.equal(sheet.rowCount, ARCHIVE_EXCEL_HEADER_ROW + 12 + 1);
    const start = ARCHIVE_EXCEL_HEADER_ROW + 1;
    const end = start + bookings.length - 1;
    assert.equal(sheet.getCell(`C${start}`).value, '=HYPERLINK("bad")');
    assert.equal(sheet.getCell(`C${start}`).type, ExcelJS.ValueType.String);
    assert.equal(sheet.getCell(`D${start}`).value, "0501234567");
    assert.equal(sheet.getCell(`I${start}`).value, 250.5);
    assert.equal(sheet.getCell(`L${start}`).value, 150.25);
    assert.equal(sheet.getCell(`B${start + 1}`).value, "شاليه الاختبار");
    assert(String(sheet.getCell("A1").value).includes("شاليه الاختبار"));
    assert(String(sheet.getCell("A2").value).includes("المالك التجريبي"));
    assert(String(sheet.getCell("A3").value).includes("هـ"));
    assert(String(sheet.getCell("A3").value).includes(" م"));
    assert.equal(sheet.getCell(`I${start}`).numFmt, SAR_ACCOUNTING_FORMAT);
    assert.equal(sheet.getCell(`I${end + 1}`).formula, `SUM(I${start}:I${end})`);
    assert.equal(sheet.getCell(`I${end + 1}`).result, 3006);
    assert.equal(sheet.getCell(`J${end + 1}`).result, 1203);
    assert.equal(sheet.getCell(`N${end + 1}`).result, 6000);
    // ExcelJS's reader does not deserialize calcPr; formulas and cached results are checked above.
    assert((sheet.getColumn(3).width ?? 0) > 20);
  });
  it("uses full collected balance correctly and includes cancellation refund/income separately", () => {
    const table = buildArchiveExportTable("cancelled", [{
      id: 1, clientName: "اختبار", bookingDate: "2020-01-01", durationDays: 1,
      totalPrice: "300", depositPaid: "100", balanceCollected: true, insuranceRefunded: true,
      cancelRefundAmount: "50", cancelIncome: "250", cancelReason: "سبب",
    }], [], () => "عقار");
    assert.equal(table.rows[0][8], 300);
    assert.equal(table.rows[0][9], 0);
    assert.equal(table.rows[0][13], 50);
    assert.equal(table.rows[0][14], 250);
  });
  it("exports rescheduling history without inventing historical financial amounts", () => {
    const table = buildArchiveExportTable("rescheduled", [], [{
      bookingId: 10, clientName: "عميل", oldDate: "2020-01-01", newDate: "2020-02-01",
      oldDuration: 1, newDuration: 2, reason: "<script>safe text</script>", rescheduledAt: "2020-01-01T12:00:00Z",
    }], () => "");
    assert.equal(table.rows[0][0], 10);
    assert.equal(table.rows[0][3], "2020-01-01");
    assert.equal(table.rows[0][4], "2020-02-01");
    assert(!table.headers.some(header => header.includes("قيمة")));
  });
});
