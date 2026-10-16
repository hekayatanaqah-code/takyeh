import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { archiveTotals, buildArchiveExportTable, createArchiveWorkbook, SAR_ACCOUNTING_FORMAT } from "./bookingArchiveExport";
import { buildArchivePdfPage } from "./bookingArchivePdf";
import { archivePdfColumns } from "./bookingArchivePdfColumns";
import { calendarOpeningDate } from "./calendarOpeningDate";
import { reportAmount, reportDateRange, reportDualDate, reportIssuedAt, reportShortDate, type ArchiveReportContext } from "./bookingArchiveReport";
import { archiveToday, getArchiveDateError, EMPTY_ARCHIVE_FILTERS } from "./bookingArchive";

const context: ArchiveReportContext = {
  propertyNames: ["شاليه الياسمين"], ownerName: "نشاط تجريبي", ownerPhone: "0500000000",
  platformLogoUrl: "/platform-logo.png", ownerLogoUrl: "/owner-logo.png",
  calendarPreference: "hijri", from: "2026-01-01", to: "2026-01-31", issuedAt: "2026-01-01T22:05:00Z",
};
const bookings = Array.from({ length: 14 }, (_, id) => ({
  id: id + 1, clientName: id === 0 ? '<script>alert("x")</script>' : "اسم العميل الطويل للاختبار",
  clientPhone: "0500000000", bookingDate: "2026-01-01", durationDays: 2,
  totalPrice: "0.10", depositPaid: "0.10", balanceCollected: false,
  insuranceFee: "500.20", insuranceReceived: id % 2 === 0, insuranceRefunded: false,
}));
const table = buildArchiveExportTable("completed", bookings, [], () => "شاليه الياسمين", "hijri");

describe("formal archive report", () => {
  it("orders both calendar dates by the saved preference and uses Saudi issue day", () => {
    const hijri = reportDualDate("2026-01-01", "hijri");
    const gregorian = reportDualDate("2026-01-01", "gregorian");
    assert(hijri.indexOf("هـ") < hijri.indexOf(" م"));
    assert(gregorian.indexOf(" م") < gregorian.indexOf("هـ"));
    assert(reportDateRange(context).includes(hijri));
    assert(reportIssuedAt(context).includes(reportDualDate("2026-01-02", "hijri"))); // 01:05 Saudi
    assert.equal(reportDateRange({ ...context, from: undefined, to: undefined }), "جميع الفترات (حتى تاريخه)");
    assert(!reportIssuedAt(context).includes("السعودية"));
    assert(reportDateRange({ ...context, to: undefined }).includes("نهاية السجلات"));
  });
  it("uses exact minor-unit totals over all matched rows, with actual received insurance separate", () => {
    const totals = archiveTotals(table);
    assert.equal(totals[7], 1.4);
    assert.equal(totals[8], 1.4);
    const received = table.headers.indexOf("التأمين المستلم (ر.س)");
    assert.equal(totals[received], 3501.4);
    assert.equal(reportAmount(-12.5).includes("-"), false);
    assert(reportAmount(-12.5).includes("("));
    assert(reportAmount(-12.5).includes("ر.س"));
  });
  it("keeps every booking field in a single horizontal row, including cancellation extras", () => {
    for (const tab of ["completed", "cancelled", "rescheduled"] as const) {
      const report = buildArchiveExportTable(tab, bookings, [], () => "شاليه الياسمين", "hijri");
      const columns = archivePdfColumns(report);
      const fields = columns.flatMap(column => column.fields.map(field => field.index));
      assert.equal(fields.length, report.headers.length);
      assert.equal(new Set(fields).size, report.headers.length);
      if (tab === "completed") assert.equal(columns.length, 15);
      assert(columns.every(column => column.fields.length === 1));
      const html = buildArchivePdfPage({ table: report, context, rows: report.rows.slice(0, 2),
        includeSummary: true, pageNumber: 1, totalPages: 1 });
      assert.equal((html.match(/<table /g) ?? []).length, 1);
      assert.equal((html.match(/data-booking-row=/g) ?? []).length, report.rows.slice(0, 2).length);
      if (report.rows.length) for (let index = 0; index < report.headers.length; index++) {
        assert(html.split("</tbody>")[0].includes(`data-field="${index}"`));
      }
    }
  });
  it("includes genuine branding, owner identity, dual metadata, copyright and global totals without unsafe HTML", () => {
    const html = buildArchivePdfPage({ table, context, rows: table.rows.slice(0, 1), includeSummary: true,
      pageNumber: 2, totalPages: 3 });
    assert(html.includes("أرشيف حجوزات: شاليه الياسمين"));
    assert(html.includes("/platform-logo.png"));
    assert(html.includes("/owner-logo.png"));
    assert(html.includes("نشاط تجريبي"));
    assert(html.includes("0500000000"));
    assert(html.includes("جميع الحقوق محفوظة لمنصة تكيّة"));
    assert(html.includes("الإجمالي (كل السجلات المطابقة)"));
    assert(html.includes(reportAmount(1.4).replace(" ر.س", "")));
    assert(html.includes(reportShortDate(bookings[0].bookingDate, context.calendarPreference)));
    assert(html.includes("letter-spacing:0!important"));
    assert(!html.includes('class="ap-field-label"'));
    assert(!html.includes('<script>alert("x")</script>'));
    assert(html.includes("&lt;script&gt;"));
    const noTotals = buildArchivePdfPage({ table, context, rows: table.rows.slice(0, 1), includeSummary: false, pageNumber: 1, totalPages: 3 });
    assert(!noTotals.includes("<tfoot>"));
  });
  it("measures all Excel rows for widths, wraps long text, and totals all monetary columns with SUM", async () => {
    const longTable = { ...table, rows: table.rows.map((row, index) => row.map((cell, column) => index === 13 && column === 2 ? "اسم عربي طويل ".repeat(16) : cell)) };
    const buffer = await createArchiveWorkbook(longTable, { ...context, calendarPreference: "gregorian" });
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet(1)!;
    assert.equal(sheet.getColumn(3).width, 76);
    assert.equal(sheet.views[0].rightToLeft, true);
    assert.equal(sheet.views[0].activeCell, "A8");
    assert.equal(sheet.getCell("A1").alignment.horizontal, "right");
    assert.equal(sheet.getCell("A1").alignment.readingOrder, "rtl");
    assert.equal(sheet.getCell("A7").value, "رقم الحجز");
    assert.equal(sheet.getCell("I7").value, "العربون المسجل (ر.س)");
    assert.equal(sheet.getCell("J7").value, "التحصيلات من الإيجار (ر.س)");
    assert((sheet.getRow(21).height ?? 0) > 28);
    assert(String(sheet.getCell("A3").value).indexOf(" م") < String(sheet.getCell("A3").value).indexOf("هـ"));
    for (const column of longTable.numericColumns) {
      const exportedColumn = (sheet.getRow(7).values as string[]).indexOf(longTable.headers[column]);
      const totalCell = sheet.getRow(sheet.rowCount).getCell(exportedColumn);
      assert(totalCell.formula.startsWith("SUM("));
      assert.equal(totalCell.result, archiveTotals(longTable)[column]);
      assert.equal(totalCell.numFmt, SAR_ACCOUNTING_FORMAT);
      assert.equal(typeof sheet.getRow(8).getCell(exportedColumn).value, "number");
    }
    assert.equal(sheet.getRow(sheet.rowCount).getCell(1).value, "الإجمالي");
  });
  it("keeps date-range validation independent of the picker calendar", () => {
    assert(getArchiveDateError({ ...EMPTY_ARCHIVE_FILTERS, period: "custom", from: "2026-01-02", to: "2026-01-01" }));
    assert.equal(getArchiveDateError({ ...EMPTY_ARCHIVE_FILTERS, period: "custom", from: "2026-01-01", to: "2026-01-01" }), null);
  });
  it("anchors end-date navigation on the start date, clamping bounds without choosing today", () => {
    assert.equal(calendarOpeningDate("2026-10-17", "2024-02-14", "2024-02-14"), "2024-02-14");
    assert.equal(calendarOpeningDate("2026-10-17", "2028-02-14", "2028-02-14"), "2028-02-14");
    assert.equal(calendarOpeningDate("2026-10-17", undefined, "2028-02-14"), "2028-02-14");
    assert.equal(calendarOpeningDate("2026-10-17", undefined, undefined, "2024-02-14"), "2024-02-14");
  });
  it("blocks future range boundaries using today's Saudi day, including the UTC midnight boundary", () => {
    const now = Date.parse("2026-10-16T21:05:00Z");
    assert.equal(archiveToday(now), "2026-10-17");
    assert.equal(getArchiveDateError({ ...EMPTY_ARCHIVE_FILTERS, period: "custom", from: "2026-10-17", to: "2026-10-17" }, now), null);
    for (const boundary of ["from", "to"] as const) {
      assert(getArchiveDateError({ ...EMPTY_ARCHIVE_FILTERS, period: "custom", [boundary]: "2026-10-18" }, now));
    }
  });
});
