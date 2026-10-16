export type ArchiveTab = "cancelled" | "rescheduled" | "completed";
type Cell = string | number;
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
export interface ArchiveExportTable { title: string; headers: string[]; rows: Cell[][]; numericColumns: number[] }
export const ARCHIVE_TAB_LABELS: Record<ArchiveTab, string> = { cancelled: "الملغاة", rescheduled: "المعاد جدولتها", completed: "المكتملة" };
const periodLabel = (value?: string | null) => ({ morning: "صباحي", evening: "مسائي", full_day: "يوم كامل" }[value ?? ""] ?? "");
const money = (value?: string | null): Cell => value == null || value === "" ? "" : Number(value);

export function buildArchiveExportTable(tab: ArchiveTab, bookings: ExportBooking[], logs: ExportLog[],
  propertyName: (id?: number | null) => string): ArchiveExportTable {
  const title = `أرشيف الحجوزات — ${ARCHIVE_TAB_LABELS[tab]}`;
  if (tab === "rescheduled") return {
    title, headers: ["رقم الحجز", "اسم العميل", "رقم الجوال", "الموعد السابق", "الموعد الجديد", "المدة السابقة", "المدة الجديدة", "سبب التعديل", "تاريخ التعديل"],
    rows: logs.map(log => [log.bookingId, log.clientName, log.clientPhone ?? "", log.oldDate, log.newDate,
      log.oldDuration, log.newDuration, log.reason, new Date(log.rescheduledAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh", calendar: "gregory" })]),
    numericColumns: [],
  };
  const headers = ["رقم الحجز", "العقار", "اسم العميل", "رقم الجوال", "تاريخ بداية الإقامة", "عدد الأيام", "الفترة",
    "قيمة الحجز (ر.س)", "المدفوع (ر.س)", "المتبقي (ر.س)", "التأمين (ر.س)", "حالة التأمين", "خصم التلفيات (ر.س)"];
  if (tab === "cancelled") headers.push("المسترد عند الإلغاء (ر.س)", "الدخل المحتفظ به (ر.س)", "سبب الإلغاء");
  return {
    title, headers, numericColumns: tab === "cancelled" ? [7, 8, 9, 10, 12, 13, 14] : [7, 8, 9, 10, 12],
    rows: bookings.map(booking => {
      const total = Number(booking.totalPrice ?? 0);
      const paid = booking.balanceCollected ? total : Number(booking.depositPaid ?? 0);
      const insuranceState = !Number(booking.insuranceFee ?? 0) ? "لا يوجد" : booking.insuranceRefunded ? "تمت التسوية"
        : booking.insuranceReceived ? "مستلم" : "لم يستلم";
      const row: Cell[] = [booking.id, propertyName(booking.submissionId), booking.clientName, booking.clientPhone ?? "",
        booking.bookingDate, booking.durationDays, periodLabel(booking.period), money(booking.totalPrice),
        paid, Math.max(0, total - paid), money(booking.insuranceFee), insuranceState, money(booking.insuranceDeducted)];
      if (tab === "cancelled") row.push(money(booking.cancelRefundAmount), money(booking.cancelIncome), booking.cancelReason ?? "");
      return row;
    }),
  };
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

export async function createArchiveWorkbook(table: ArchiveExportTable, description: string) {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.default.Workbook();
  workbook.creator = "منصة تكية";
  const sheet = workbook.addWorksheet("أرشيف الحجوزات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 4 }] });
  sheet.addRow([table.title]);
  sheet.mergeCells(1, 1, 1, table.headers.length);
  sheet.addRow([description]);
  sheet.mergeCells(2, 1, 2, table.headers.length);
  sheet.addRow([`عدد السجلات: ${table.rows.length} — المبالغ بالريال السعودي`]);
  sheet.mergeCells(3, 1, 3, table.headers.length);
  sheet.addRow(table.headers);
  // Text is explicitly written as string values, never Excel formula objects.
  sheet.addRows(table.rows);
  sheet.getRow(1).font = { bold: true, size: 16, color: { argb: "FF087F8C" } };
  sheet.getRow(2).alignment = { wrapText: true, vertical: "middle" };
  sheet.getRow(2).height = 32;
  const header = sheet.getRow(4);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF087F8C" } };
  header.height = 34;
  table.headers.forEach((_, index) => {
    sheet.getColumn(index + 1).width = index === 2 ? 26 : 22;
    if (table.numericColumns.includes(index)) sheet.getColumn(index + 1).numFmt = '#,##0.00;[Red](#,##0.00)';
  });
  sheet.eachRow(row => { row.alignment = { ...row.alignment, readingOrder: "rtl", wrapText: true, vertical: "middle" }; });
  sheet.autoFilter = { from: { row: 4, column: 1 }, to: { row: Math.max(4, sheet.rowCount), column: table.headers.length } };
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:4" };
  return workbook.xlsx.writeBuffer();
}

const escapeHtml = (value: Cell) => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

export async function exportArchiveFile(format: "xlsx" | "pdf", table: ArchiveExportTable, description: string) {
  const filename = `أرشيف-الحجوزات-${new Date().toISOString().slice(0, 10)}`;
  if (format === "xlsx") {
    const buffer = await createArchiveWorkbook(table, description);
    downloadBlob(new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${filename}.xlsx`);
    return;
  }
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
  await document.fonts.ready;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const host = document.createElement("div");
  host.dir = "rtl";
  host.style.cssText = "position:fixed;left:-100000px;top:0;width:1400px;background:white;color:#172b32;padding:28px;font-family:Arial,sans-serif;pointer-events:none";
  document.body.appendChild(host);
  try {
    const pageSize = 12;
    const pages = Math.max(1, Math.ceil(table.rows.length / pageSize));
    for (let page = 0; page < pages; page++) {
      host.innerHTML = `<h1 style="font-size:25px;margin:0 0 12px">${escapeHtml(table.title)}</h1>
        <p style="font-size:14px;margin-bottom:8px">${escapeHtml(description)}</p>
        <p style="font-size:13px">عدد السجلات: ${table.rows.length} — المبالغ بالريال السعودي — صفحة ${page + 1} من ${pages}</p>
        <table dir="rtl" style="border-collapse:collapse;width:100%;table-layout:fixed;font-size:13px">
        <thead><tr>${table.headers.map(header => `<th style="background:#087f8c;color:white;border:1px solid #b8c9cd;padding:10px 5px;overflow-wrap:anywhere">${escapeHtml(header)}</th>`).join("")}</tr></thead>
        <tbody>${table.rows.slice(page * pageSize, (page + 1) * pageSize).map((row, index) => `<tr style="background:${index % 2 ? "#edf6f6" : "#fff"}">${row.map((value, col) => `<td style="border:1px solid #c8d5d8;padding:9px 5px;overflow-wrap:anywhere;white-space:pre-wrap">${escapeHtml(typeof value === "number" && table.numericColumns.includes(col) ? value.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : value)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      const canvas = await html2canvas(host, { scale: 1.5, backgroundColor: "#ffffff", logging: false });
      if (page) pdf.addPage();
      const width = 277;
      const height = canvas.height * width / canvas.width;
      const scale = Math.min(1, 190 / height);
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10, width * scale, height * scale);
      canvas.width = 0;
      canvas.height = 0;
    }
    pdf.save(`${filename}.pdf`);
  } finally {
    host.remove();
  }
}
