import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveDateRange, archivePageNumbers, EMPTY_ARCHIVE_FILTERS } from "./bookingArchive";
import { buildArchiveExportTable, createArchiveWorkbook } from "./bookingArchiveExport";

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
    const buffer = await createArchiveWorkbook(table, "نتائج البحث");
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet(1)!;
    assert.equal(sheet.views[0].rightToLeft, true);
    assert.equal(sheet.rowCount, 16); // four header rows + all twelve records
    assert.equal(sheet.getCell("C5").value, '=HYPERLINK("bad")');
    assert.equal(sheet.getCell("C5").type, ExcelJS.ValueType.String);
    assert.equal(sheet.getCell("D5").value, "0501234567");
    assert.equal(sheet.getCell("H5").value, 250.5);
    assert.equal(sheet.getCell("J5").value, 150.25);
    assert.equal(sheet.getCell("B6").value, "شاليه الاختبار");
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
