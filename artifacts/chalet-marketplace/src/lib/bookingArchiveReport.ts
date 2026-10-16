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

export function reportDateRange(context: ArchiveReportContext): string {
  if (!context.from && !context.to) return "جميع التواريخ";
  return `${context.from ? reportDualDate(context.from, context.calendarPreference) : "من بداية السجلات"} إلى ${context.to ? reportDualDate(context.to, context.calendarPreference) : "نهاية السجلات"}`;
}

export function reportPropertyTitle(context: ArchiveReportContext): string {
  return `أرشيف حجوزات: ${context.propertyNames.length ? context.propertyNames.join("، ") : "جميع العقارات"}`;
}

export function reportIssuedAt(context: ArchiveReportContext): string {
  const time = new Intl.DateTimeFormat("ar-SA", { timeZone: "Asia/Riyadh", hour: "2-digit", minute: "2-digit" }).format(new Date(context.issuedAt));
  return `${reportDualDate(context.issuedAt, context.calendarPreference)}، ${time} (توقيت السعودية)`;
}

export const reportEscape = (value: string | number): string => String(value).replace(/[&<>"']/g, character =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

export function reportAmount(value: number): string {
  const digits = Math.abs(value).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? `(${digits})` : digits} ر.س`;
}
