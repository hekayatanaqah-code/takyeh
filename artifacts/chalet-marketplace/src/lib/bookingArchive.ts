import type { ArchiveFilters } from "@/components/owner/BookingArchiveControls";
import { getHijriMonthDays, prevHijriMonth, toGregorianStr, toHijriComponents } from "./hijri";
import type { ReportCalendar } from "./bookingArchiveReport";

export const EMPTY_ARCHIVE_FILTERS: ArchiveFilters = { search: "", period: "all", year: "", from: "", to: "" };

export function archiveToday(now = Date.now()): string {
  return new Date(now + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function getArchiveDateError(filters: ArchiveFilters, now = Date.now()): string | null {
  if (filters.period !== "custom") return null;
  const today = archiveToday(now);
  if (filters.from > today || filters.to > today) return "لا يمكن اختيار تاريخ بعد اليوم في الأرشيف والتقارير";
  return filters.from && filters.to && filters.from > filters.to
    ? "تاريخ البداية يجب أن يكون قبل تاريخ النهاية أو مساويًا له" : null;
}

export function archiveCalendarYear(calendar: ReportCalendar, now = Date.now()): number {
  const today = archiveToday(now);
  return calendar === "hijri" ? toHijriComponents(new Date(`${today}T12:00:00`)).year : Number(today.slice(0, 4));
}

/** API years are Gregorian; include all corresponding selectable years in the active calendar. */
export function archiveCalendarYears(years: string[], calendar: ReportCalendar, now = Date.now()): string[] {
  const current = archiveCalendarYear(calendar, now);
  const result = new Set([String(current)]);
  for (const year of years.filter(value => /^\d{4}$/.test(value))) {
    if (calendar === "gregorian") result.add(year);
    else {
      const first = toHijriComponents(new Date(`${year}-01-01T12:00:00`)).year;
      const last = toHijriComponents(new Date(`${year}-12-31T12:00:00`)).year;
      for (let candidate = first; candidate <= last; candidate++) result.add(String(candidate));
    }
  }
  return [...result].filter(year => Number(year) <= current).sort((a, b) => Number(b) - Number(a));
}

function hijriMonthRange(year: number, month: number): { from: string; to: string } {
  const days = getHijriMonthDays(year, month);
  if (!days.length || days[0].hijriDay !== 1) throw new Error("تعذّر تحديد حدود الشهر الهجري.");
  return { from: toGregorianStr(days[0].date), to: toGregorianStr(days[days.length - 1].date) };
}

/** Resolve the chosen calendar into Gregorian API boundaries; custom ISO days stay unchanged. */
export function archiveDateRange(filters: ArchiveFilters, now = Date.now(), calendar: ReportCalendar = "gregorian"): { from?: string; to?: string } {
  if (filters.period === "all") return {};
  if (filters.period === "custom") return { from: filters.from || undefined, to: filters.to || undefined };
  if (filters.period === "year") {
    if (!/^\d{4}$/.test(filters.year)) return {};
    return calendar === "hijri"
      ? { from: hijriMonthRange(Number(filters.year), 1).from, to: hijriMonthRange(Number(filters.year), 12).to }
      : { from: `${filters.year}-01-01`, to: `${filters.year}-12-31` };
  }
  if (calendar === "hijri") {
    const current = toHijriComponents(new Date(`${archiveToday(now)}T12:00:00`));
    const { year, month } = filters.period === "last-month" ? prevHijriMonth(current.year, current.month) : current;
    return hijriMonthRange(year, month);
  }
  const saudi = new Date(now + 3 * 60 * 60 * 1000);
  const year = saudi.getUTCFullYear();
  const month = saudi.getUTCMonth() - (filters.period === "last-month" ? 1 : 0);
  return {
    from: new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10),
    to: new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10),
  };
}

export function archivePageNumbers(page: number, totalPages: number): (number | "gap")[] {
  const pages = Array.from(new Set([1, page - 1, page, page + 1, totalPages]))
    .filter(p => p > 0 && p <= totalPages).sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  pages.forEach((p, i) => {
    if (i && p - pages[i - 1] > 1) result.push("gap");
    result.push(p);
  });
  return result;
}
