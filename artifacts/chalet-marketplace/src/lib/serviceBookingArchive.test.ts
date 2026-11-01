import assert from "node:assert/strict";
import { it } from "node:test";
import { filterServiceBookingArchive, buildServiceBookingArchiveTable, type ServiceArchiveAppointment } from "./serviceBookingArchive";
import { EMPTY_ARCHIVE_FILTERS } from "./bookingArchive";
import { archiveTotals, createArchiveWorkbook } from "./bookingArchiveExport";
import { buildArchivePdfPage } from "./bookingArchivePdf";
import { toHijriComponents } from "./hijri";

const now = Date.parse("2026-11-01T21:00:00Z"); // Saudi midnight, November 2.
const base = { providerId: 7, dateStr: "2026-11-01", status: "confirmed", amount: "300", deposit: "100", insuranceAmount: "500", clientName: "عميل اختبار", clientPhone: "0512345678" };
const appointments: ServiceArchiveAppointment[] = [
  { ...base, id: 1 },
  { ...base, id: 2, dateStr: "2026-11-02" },
  { ...base, id: 3, duration: "2", durationUnit: "days" },
  { ...base, id: 4, dateStr: "2026-10-31", duration: "2", durationUnit: "days" },
  { ...base, id: 5, status: "cancelled", cancelRefundAmount: "50", cancelReason: "تغير الموعد" },
  { ...base, id: 6, providerId: 8 },
  { ...base, id: 7, dateStr: "2026-11-10" },
];
const completed = (filters = EMPTY_ARCHIVE_FILTERS) => filterServiceBookingArchive(appointments, 7, "completed", filters, "gregorian", now);

it("isolates providers and archives only after the last complete Saudi day", () => {
  assert.deepEqual(completed().map(a => a.id), [1, 4]);
  assert.deepEqual(filterServiceBookingArchive(appointments, 7, "cancelled", EMPTY_ARCHIVE_FILTERS, "gregorian", now).map(a => a.id), [5]);
});

it("applies independent search, selected Gregorian months and inclusive custom ranges", () => {
  assert.deepEqual(completed({ ...EMPTY_ARCHIVE_FILTERS, period: "month", year: "2026", month: "10" }).map(a => a.id), [4]);
  assert.deepEqual(completed({ ...EMPTY_ARCHIVE_FILTERS, period: "month", year: "2026", month: "11" }).map(a => a.id), [1]);
  assert.equal(completed({ ...EMPTY_ARCHIVE_FILTERS, search: "٠٥١٢٣٤٥٦٧٨" }).length, 2);
  assert.equal(completed({ ...EMPTY_ARCHIVE_FILTERS, search: "لا يوجد" }).length, 0);
  assert.deepEqual(completed({ ...EMPTY_ARCHIVE_FILTERS, period: "custom", from: "2026-11-01", to: "2026-11-01" }).map(a => a.id), [1]);
  assert.deepEqual(completed({ ...EMPTY_ARCHIVE_FILTERS, period: "month", year: "2026", month: "" }), []);
});

it("uses the selected Umm al-Qura month and year instead of Gregorian month numbers", () => {
  const hijri = toHijriComponents(new Date("2026-11-01T12:00:00"));
  const filters = { ...EMPTY_ARCHIVE_FILTERS, period: "month" as const, year: String(hijri.year), month: String(hijri.month) };
  const rows = filterServiceBookingArchive(appointments, 7, "completed", filters, "hijri", now);
  assert.ok(rows.some(a => a.id === 1));
  assert.ok(rows.every(a => {
    const date = toHijriComponents(new Date(`${a.dateStr}T12:00:00`));
    return date.year === hijri.year && date.month === hijri.month;
  }));
});

it("exports every match beyond the displayed page and keeps refundable insurance outside service payments", () => {
  const rows = Array.from({ length: 21 }, (_, index) => ({ ...base, id: index + 20 }));
  const table = buildServiceBookingArchiveTable(rows, "خدمة الاختبار", "completed", "hijri");
  assert.equal(table.rows.length, 21);
  assert.deepEqual(table.rows[0].slice(6, 10), [300, 100, 200, 500]);
  assert.equal(archiveTotals(table)[7], 2100);
  assert.equal(archiveTotals(table)[9], 10500);
  assert.ok(table.headers.includes("الخدمة"));
  assert.ok(!table.headers.includes("العقار"));
});

it("reports cancellation refunds separately and preserves missing prices without invented zeros", () => {
  const cancelled = buildServiceBookingArchiveTable([appointments[4]], "خدمة الاختبار", "cancelled", "gregorian");
  assert.equal(cancelled.rows[0][8], 0);
  assert.equal(cancelled.rows[0][11], 50);
  const unknown = buildServiceBookingArchiveTable([{ ...appointments[0], amount: null }], "خدمة الاختبار", "completed", "hijri");
  assert.equal(unknown.rows[0][6], "غير مسجل");
  assert.equal(unknown.rows[0][8], "غير مسجل");
  assert.ok(!unknown.numericColumns.includes(6));
  assert.throws(() => buildServiceBookingArchiveTable([{ ...appointments[0], amount: "invalid" }], "خدمة الاختبار", "completed", "hijri"));
});

it("uses the existing Excel and PDF engines with service identities and original date metadata", async () => {
  const table = buildServiceBookingArchiveTable(completed(), "خدمة الاختبار", "completed", "hijri");
  const context = { propertyNames: ["خدمة الاختبار"], ownerName: "مالك اختبار", ownerPhone: "", platformLogoUrl: "data:image/png;base64,", calendarPreference: "hijri" as const, issuedAt: "2026-11-02T00:00:00Z" };
  const buffer = await createArchiveWorkbook(table, context);
  assert.ok(buffer.byteLength > 1000);
  const html = buildArchivePdfPage({ table, context, rows: table.rows, width: 1800, includeSummary: true, pageNumber: 1, totalPages: 1 });
  assert.ok(html.includes("خدمة الاختبار"));
  assert.ok(html.includes("المحصل من الخدمة"));
  assert.ok(!html.includes(">العقار<"));
  assert.deepEqual(table.dateValues?.[0].values, ["2026-11-01", "2026-10-31"]);
});
