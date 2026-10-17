import type { ArchiveExportTable } from "./bookingArchiveExport";
import { toHijriComponents } from "./hijri";

export type ReportCalendar = "hijri" | "gregorian";

export interface ArchiveReportContext {
  propertyNames: string[];
  ownerName: string;
  ownerPhone: string;
  ownerLogoUrl?: string | null;
  propertyLogos?: { name: string; url: string }[];
  platformLogoUrl: string;
  calendarPreference: ReportCalendar;
  from?: string;
  to?: string;
  search?: string;
  issuedAt: string;
}

/** Date-only values are Saudi calendar days; timestamps first resolve to their Saudi day. */
export function reportDualDate(value: string, preference: ReportCalendar): string {
  if (!value) return "";
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+03:00` : value);
  if (!Number.isFinite(date.getTime())) throw new Error("تاريخ التقرير غير صالح");
  const format = (calendar: string) => new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh", calendar, day: "numeric", month: "long", year: "numeric",
  }).format(date).replace(/\s*[هـم]+\s*$/, "").trim();
  const hijri = `${format("islamic-umalqura")} هـ`;
  const gregorian = `${format("gregory")} م`;
  return preference === "hijri" ? `${hijri} — ${gregorian}` : `${gregorian} — ${hijri}`;
}

export function reportDateRange(context: ArchiveReportContext, table?: ArchiveExportTable): string {
  if (table) {
    // Column 4 is the stay start/new rescheduled start, never the edit timestamp or old date.
    const values = table.dateValues?.find(column => column.column === 4)?.values ?? [];
    const dates = values.filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
    if (dates.length) return `الفترة من: ${reportDualDate(dates[0], context.calendarPreference)} إلى: ${reportDualDate(dates[dates.length - 1], context.calendarPreference)}`;
    if (!table.rows.length) return "لا توجد حجوزات لتحديد الفترة";
  }
  if (!context.from && !context.to) return "جميع الفترات (حتى تاريخه)";
  return `${context.from ? reportDualDate(context.from, context.calendarPreference) : "من بداية السجلات"} إلى ${context.to ? reportDualDate(context.to, context.calendarPreference) : "نهاية السجلات"}`;
}

/** Fixed-width Hijri text sorts chronologically, without relying on Excel's different Hijri calendar. */
export function reportHijriSortDate(value: string): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value
    : new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const h = toHijriComponents(new Date(`${dateOnly}T12:00:00`));
  return `${h.year}/${String(h.month).padStart(2, "0")}/${String(h.day).padStart(2, "0")}`;
}

/** Excel stores Gregorian dates as genuine date values; both columns refer to the same Saudi day. */
export function reportExcelDate(value: string): Date {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value
    : new Date(new Date(value).getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return new Date(`${dateOnly}T00:00:00Z`);
}

export function reportPropertyTitle(context: ArchiveReportContext): string {
  return `أرشيف حجوزات: ${context.propertyNames.length ? context.propertyNames.join("، ") : "جميع العقارات"}`;
}

export function reportIssuedAt(context: ArchiveReportContext): string {
  const time = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }).format(new Date(context.issuedAt));
  return `${reportDualDate(context.issuedAt, context.calendarPreference)}، ${time}`;
}

/** Compact date for an individual calendar, including the PDF's dual-calendar stay cell. */
export function reportShortDate(value: string, preference: ReportCalendar): string {
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+03:00` : value);
  return new Intl.DateTimeFormat("ar-SA", {
    timeZone: "Asia/Riyadh", calendar: preference === "hijri" ? "islamic-umalqura" : "gregory",
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(date).replace(/\s*[هـم]+\s*$/, "").trim() + (preference === "hijri" ? " هـ" : " م");
}

export const reportEscape = (value: string | number): string => String(value).replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

export function reportAmount(value: number): string {
  const digits = Math.abs(value).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? `(${digits})` : digits} ر.س`;
}
