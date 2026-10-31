import { HIJRI_MONTHS_AR, toHijriComponents } from "./hijri";

export interface RevenuePeriod {
  calendar: "gregorian" | "hijri";
  year: string;
  /** Numeric YYYY-MM in the selected calendar; empty means the whole year. */
  month: string;
  /** Inclusive ISO-date bounds; absent for existing month/year consumers. */
  range?: { from: string; to: string };
}

const GREGORIAN_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const;

export function revenueMonthKey(dateStr: string, calendar: RevenuePeriod["calendar"]): string {
  if (calendar === "gregorian") return dateStr.slice(0, 7);
  const hijri = toHijriComponents(new Date(`${dateStr.slice(0, 10)}T12:00:00`));
  return `${hijri.year}-${String(hijri.month).padStart(2, "0")}`;
}

export function isInRevenuePeriod(dateStr: string | null | undefined, period: RevenuePeriod): boolean {
  if (!dateStr) return false;
  if (period.range) {
    const { from, to } = period.range;
    return !!from && !!to && from <= to && dateStr.slice(0, 10) >= from && dateStr.slice(0, 10) <= to;
  }
  if (!period.year) return true;
  const key = revenueMonthKey(dateStr, period.calendar);
  return period.month ? key === period.month : key.startsWith(`${period.year}-`);
}

export function revenueSalesTitle(period: RevenuePeriod): string {
  if (period.range) return "إجمالي المبيعات خلال الفترة المحددة";
  if (!period.year) return "إجمالي المبيعات العام";
  if (!period.month) {
    const year = Number(period.year).toLocaleString("ar-SA", { useGrouping: false });
    return `إجمالي مبيعات عام ${year} ${period.calendar === "hijri" ? "هـ" : "م"}`;
  }
  const names = period.calendar === "hijri" ? HIJRI_MONTHS_AR : GREGORIAN_MONTHS;
  return `إجمالي مبيعات ${names[Number(period.month.split("-")[1]) - 1]}`;
}
