import { reportDualDate, reportDateRange, reportIssuedAt, reportPropertyTitle, reportHijriSortDate, reportExcelDate, type ArchiveReportContext, type ReportCalendar } from "./bookingArchiveReport";
import { archiveAccountingOrder } from "./archiveAccountingOrder";

export type ArchiveTab = "cancelled" | "rescheduled" | "completed";
export type ArchiveCell = string | number;
type Cell = ArchiveCell;
interface ExportBooking {
  id: number; submissionId?: number | null; clientName: string; clientPhone?: string | null;
  bookingDate: string; durationDays: number; period?: string | null; totalPrice?: string | null;
  depositPaid?: string | null; balanceCollected: boolean; insuranceFee?: string | null;
  insuranceReceived?: boolean | null; insuranceRefunded: boolean; insuranceDeducted?: string | null;
  cancelRefundAmount?: string | null; cancelIncome?: string | null; cancelReason?: string | null;
}
interface ExportLog {
  bookingId: number; clientName: string; clientPhone?: string | null; oldDate: string; newDate: string;
  oldDuration: number; newDuration: number; reason: string; rescheduledAt: string;
}
export interface ArchiveExportTable {
  kind?: "insurance";
  title: string; headers: string[]; rows: Cell[][]; numericColumns: number[]; summaryNote?: string;
  /** Original ISO dates for compact PDF cells, without parsing localized text or changing Excel. */
  dateValues?: { column: number; values: string[] }[];
}
export const ARCHIVE_TAB_LABELS: Record<ArchiveTab, string> = { cancelled: "الملغاة", rescheduled: "المعاد جدولتها", completed: "المكتملة" };
const periodLabel = (value?: string | null) => ({ morning: "صباحي", evening: "مسائي", full_day: "يوم كامل" }[value ?? ""] ?? "");
const money = (value?: string | null): number => value == null || value === "" ? 0 : Number(value);

export function buildArchiveExportTable(tab: ArchiveTab, bookings: ExportBooking[], logs: ExportLog[],
  propertyName: (id?: number | null) => string, calendarPreference?: ReportCalendar): ArchiveExportTable {
  const dateLabel = (value: string) => calendarPreference ? reportDualDate(value, calendarPreference) : value;
  const title = `أرشيف الحجوزات — ${ARCHIVE_TAB_LABELS[tab]}`;
  if (tab === "rescheduled") return {
    title, headers: ["رقم الحجز", "اسم العميل", "رقم الجوال", "الموعد السابق", "الموعد الجديد", "المدة السابقة", "المدة الجديدة", "سبب التعديل", "تاريخ التعديل"],
    rows: logs.map(log => [log.bookingId, log.clientName, log.clientPhone ?? "", dateLabel(log.oldDate), dateLabel(log.newDate),
      log.oldDuration, log.newDuration, log.reason, calendarPreference ? reportDualDate(log.rescheduledAt, calendarPreference) : new Date(log.rescheduledAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory" })]),
    numericColumns: [],
    dateValues: [
      { column: 3, values: logs.map(log => log.oldDate) }, { column: 4, values: logs.map(log => log.newDate) },
      { column: 8, values: logs.map(log => log.rescheduledAt) },
    ],
  };
  const headers = ["رقم الحجز", "العقار", "اسم العميل", "رقم الجوال", "تاريخ بداية الإقامة", "عدد الأيام", "الفترة",
    "الإيجار (⃁)", "التحصيلات من الإيجار (⃁)", "المتبقي (⃁)", "التأمين المستحق (⃁)", "حالة التأمين", "خصم التلفيات (⃁)"];
  if (tab === "cancelled") headers.push("المسترد عند الإلغاء (⃁)", "الدخل المحتفظ به (⃁)", "سبب الإلغاء");
  const depositColumn = headers.length;
  headers.push("العربون المسجل (⃁)", "التأمين المستلم (⃁)");
  return {
    title, headers, numericColumns: [...(tab === "cancelled" ? [7, 8, 9, 10, 12, 13, 14] : [7, 8, 9, 10, 12]), depositColumn, depositColumn + 1],
    dateValues: [{ column: 4, values: bookings.map(booking => booking.bookingDate) }],
    summaryNote: "التحصيلات من الإيجار قبل الاستردادات، والتأمين مستقل عنها. العربون جزء من التحصيلات وليس مبلغاً إضافياً."
      + (tab === "cancelled" ? " قيمة الحجوزات الملغاة ليست إيراداً محققاً؛ راجع عمود الدخل المحتفظ به." : ""),
    rows: bookings.map(booking => {
      const total = Number(booking.totalPrice ?? 0);
      const paid = booking.balanceCollected ? total : Number(booking.depositPaid ?? 0);
      const insuranceState = !Number(booking.insuranceFee ?? 0) ? "لا يوجد" : booking.insuranceRefunded ? "تمت التسوية"
        : booking.insuranceReceived ? "مستلم" : "لم يستلم";
      const row: Cell[] = [booking.id, propertyName(booking.submissionId), booking.clientName, booking.clientPhone ?? "",
        dateLabel(booking.bookingDate), booking.durationDays, periodLabel(booking.period), money(booking.totalPrice),
        paid, Math.max(0, total - paid), money(booking.insuranceFee), insuranceState, money(booking.insuranceDeducted)];
      if (tab === "cancelled") row.push(money(booking.cancelRefundAmount), money(booking.cancelIncome), booking.cancelReason ?? "");
      row.push(money(booking.depositPaid), booking.insuranceReceived ? Number(booking.insuranceFee ?? 0) : 0);
      return row;
    }),
  };
}

/** Integer minor units avoid binary floating-point drift in financial totals. */
export function archiveTotals(table: { headers: string[]; numericColumns: number[]; rows: readonly (readonly unknown[])[] }): (number | null)[] {
  return table.headers.map((_, column) => table.numericColumns.includes(column)
    ? table.rows.reduce((total, row) => total + (typeof row[column] === "number" ? Math.round(Number(row[column]) * 100) : 0), 0) / 100
    : null);
}

export const SAR_ACCOUNTING_FORMAT = '_("⃁"* #,##0.00_);[Red]_("⃁"* (#,##0.00);_("⃁"* "-"??_);_(@_)';
export const ARCHIVE_EXCEL_HEADER_ROW = 7;

function excelColumnName(column: number): string {
  let name = "";
  for (let value = column; value > 0; value = Math.floor((value - 1) / 26)) name = String.fromCharCode(65 + (value - 1) % 26) + name;
  return name;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function createArchiveWorkbook(source: ArchiveExportTable, context: ArchiveReportContext) {
  source.rows.forEach((row, rowIndex) => {
    for (const column of source.numericColumns) {
      if (typeof row[column] !== "number" || !Number.isFinite(row[column])) {
        throw new Error(`قيمة مالية غير رقمية في السجل ${rowIndex + 1}: ${source.headers[column]}`);
      }
    }
  });
  const dates = new Map(source.dateValues?.map(column => [column.column, column.values]));
  const calendars: ReportCalendar[] = context.calendarPreference === "hijri" ? ["hijri", "gregorian"] : ["gregorian", "hijri"];
  const order = source.kind === "insurance" ? source.headers.map((_, index) => index) : archiveAccountingOrder(source.headers, source.numericColumns.length > 0);
  const columns = order.flatMap((index): { index: number; calendar: ReportCalendar | undefined }[] =>
    dates.has(index) ? calendars.map(calendar => ({ index, calendar })) : [{ index, calendar: undefined }]);
  const table = {
    ...source, headers: columns.map(({ index, calendar }) =>
      calendar ? `${source.headers[index]} (${calendar === "hijri" ? "هجري" : "ميلادي"})` : source.headers[index]),
    rows: source.rows.map((row, position) => columns.map(({ index, calendar }): ArchiveCell | Date => {
      const date = dates.get(index)?.[position];
      if (!calendar || !date) return calendar ? "" : row[index];
      return calendar === "hijri" ? reportHijriSortDate(date) : reportExcelDate(date);
    })),
    numericColumns: columns.flatMap(({ index }, position) => source.numericColumns.includes(index) ? [position] : []),
  };
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();
  workbook.creator = "منصة تكيّة";
  workbook.created = new Date(context.issuedAt);
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.views = [{ x: 0, y: 0, width: 16000, height: 10000, visibility: "visible", activeTab: 0, firstSheet: 0 }];
  const sheet = workbook.addWorksheet(source.kind === "insurance" ? "تقرير التأمينات" : "أرشيف الحجوزات", {
    views: [{ rightToLeft: true, state: "frozen", ySplit: ARCHIVE_EXCEL_HEADER_ROW,
      topLeftCell: `A${ARCHIVE_EXCEL_HEADER_ROW + 1}`, activeCell: `A${ARCHIVE_EXCEL_HEADER_ROW + 1}` }],
  });
  const metadata = [
    reportPropertyTitle(context, source.kind === "insurance" ? "تقرير التأمينات" : undefined),
    `${source.kind === "insurance" ? "" : `${table.title} | `}المالك / النشاط: ${context.ownerName} | الجوال: ${context.ownerPhone || "غير مسجل"}`,
    reportDateRange(context, source),
    `تاريخ الإصدار: ${reportIssuedAt(context)}`,
    `${context.search ? `${source.kind === "insurance" ? "الفلاتر" : "البحث"}: ${context.search} | ` : ""}عدد السجلات: ${table.rows.length} | العملة: الريال السعودي (⃁)`,
    table.summaryNote || "سجل تغييرات المواعيد؛ لا يتضمن قيماً مالية تاريخية.",
  ];
  metadata.forEach(text => {
    const row = sheet.addRow([text]);
    sheet.mergeCells(row.number, 1, row.number, table.headers.length);
    row.height = row.number === 1 ? 40 : 34;
    row.alignment = { readingOrder: "rtl", horizontal: "right", wrapText: true, vertical: "middle" };
  });
  sheet.addRow(table.headers);
  // Text is explicitly written as string values, never Excel formula objects.
  sheet.addRows(table.rows);
  const firstDataRow = ARCHIVE_EXCEL_HEADER_ROW + 1;
  const lastDataRow = ARCHIVE_EXCEL_HEADER_ROW + table.rows.length;
  const totals = archiveTotals(table);
  if (table.numericColumns.length) {
    const totalRow = sheet.addRow(table.headers.map((_, column) => {
      if (!table.numericColumns.includes(column)) return column === 0 ? "الإجمالي" : "";
      const letter = excelColumnName(column + 1);
      return { formula: table.rows.length ? `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` : "SUM(0)", result: totals[column] ?? 0 };
    }));
    totalRow.font = { bold: true, color: { argb: "FF075561" } };
    totalRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDDEFEF" } };
    totalRow.height = 34;
  }
  sheet.getRow(1).font = { name: "Arial", bold: true, size: 17, color: { argb: "FF087F8C" } };
  const header = sheet.getRow(ARCHIVE_EXCEL_HEADER_ROW);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF087F8C" } };
  header.height = 42;
  table.headers.forEach((_, index) => {
    const monetary = table.numericColumns.includes(index);
    const displayValues = [table.headers[index], ...table.rows.map(row => {
      const value = row[index];
      return monetary && typeof value === "number"
        ? `${value.toLocaleString("en-US", { minimumFractionDigits: 2 })} ⃁`
        : String(value ?? "");
    }), ...(monetary ? [`${totals[index]?.toLocaleString("en-US", { minimumFractionDigits: 2 })} ⃁`] : [])];
    // ExcelJS has no native auto-fit operation. Size from ALL data (not metadata/first page).
    const measuredWidth = displayValues.reduce((longest, value) => value.split("\n").reduce((width, line) =>
      Math.max(width, Array.from(line).length * (/[ء-ي]/.test(line) ? 1.15 : 1)), longest), 0);
    sheet.getColumn(index + 1).width = Math.max(monetary ? 24 : 14, Math.min(76, Math.ceil(measuredWidth + 4)));
    if (monetary) sheet.getColumn(index + 1).numFmt = SAR_ACCOUNTING_FORMAT;
    else if (columns[index].calendar === "gregorian") {
      sheet.getColumn(index + 1).numFmt = "yyyy/mm/dd";
      sheet.getColumn(index + 1).width = 22;
    } else if (columns[index].calendar === "hijri") {
      sheet.getColumn(index + 1).numFmt = "@";
      sheet.getColumn(index + 1).width = 22;
    }
  });
  sheet.eachRow(row => {
    row.alignment = { ...row.alignment, readingOrder: "rtl", horizontal: "right", wrapText: true, vertical: "middle" };
    if (row.number > ARCHIVE_EXCEL_HEADER_ROW && row.number <= lastDataRow) {
      let lines = 1;
      row.eachCell((cell, column) => {
        const value = cell.value instanceof Date ? cell.value.toISOString().slice(0, 10) : String(cell.value ?? "");
        const width = (sheet.getColumn(column).width ?? 20) - 3;
        lines = Math.max(lines, ...value.split("\n").map(line => Math.ceil(line.length * (/[ء-ي]/.test(line) ? 1.15 : 1) / width)));
      });
      row.height = Math.max(28, lines * 18 + 10);
    }
  });
  sheet.autoFilter = { from: { row: ARCHIVE_EXCEL_HEADER_ROW, column: 1 }, to: { row: Math.max(ARCHIVE_EXCEL_HEADER_ROW, lastDataRow), column: table.headers.length } };
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `1:${ARCHIVE_EXCEL_HEADER_ROW}` };
  sheet.headerFooter.oddFooter = "&Rالصفحة &P من &N&Lجميع الحقوق محفوظة لمنصة تكيّة";
  return workbook.xlsx.writeBuffer();
}

export async function exportArchiveFile(format: "xlsx" | "pdf", table: ArchiveExportTable, context: ArchiveReportContext) {
  const filename = `${table.kind === "insurance" ? "تقرير-التأمينات" : "أرشيف-الحجوزات"}-${context.issuedAt.slice(0, 10)}`;
  if (format === "xlsx") {
    const buffer = await createArchiveWorkbook(table, context);
    downloadBlob(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
    return;
  }
  const { createArchivePdf } = await import("./bookingArchivePdfExport");
  const pdf = await createArchivePdf(table, context);
  pdf.save(`${filename}.pdf`);
}
