import { revenueMonthKey, type RevenuePeriod } from "./revenuePeriod";

/** Includes cancelled sales: this is an audit history, not just recognized revenue. */
export function quickSalesHistoryMonths(dates: string[], calendar: RevenuePeriod["calendar"]): string[] {
  return [...new Set(dates.filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .map(date => revenueMonthKey(date, calendar)))].sort().reverse();
}

export function reconcileQuickSalesHistoryPeriod(period: RevenuePeriod, months: string[]): RevenuePeriod {
  if (!period.year || months.length === 0) return { ...period, year: "", month: "" };
  const years = new Set(months.map(month => month.slice(0, 4)));
  const year = years.has(period.year) ? period.year : months[0].slice(0, 4);
  const month = !period.month ? "" : months.includes(period.month) && period.month.startsWith(`${year}-`)
    ? period.month : months.find(key => key.startsWith(`${year}-`)) ?? "";
  return { ...period, year, month };
}

export function switchQuickSalesHistoryCalendar(
  period: RevenuePeriod, calendar: RevenuePeriod["calendar"], dates: string[],
): RevenuePeriod {
  if (calendar === period.calendar) return period;
  if (!period.year) return { calendar, year: "", month: "" };
  const months = quickSalesHistoryMonths(dates, calendar);
  return {
    calendar,
    year: months[0]?.slice(0, 4) ?? "",
    month: period.month ? months[0] ?? "" : "",
  };
}
