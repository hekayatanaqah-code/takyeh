import { fromAr } from "./utils";
import { getHijriMonthDays, toGregorianStr } from "./hijri";

/** Accept booking IDs and complete Gregorian/Hijri dates, in either digit set. */
export function customerHistorySearch(raw: string): string {
  const value = fromAr(raw).trim().replace(/\s*(هـ|م)\s*$/, "");
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value);
  const local = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value);
  if (!iso && !local) return value;
  const [year, month, day] = iso ? iso.slice(1).map(Number) : [Number(local![3]), Number(local![2]), Number(local![1])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return value;
  if (year >= 1300 && year < 1700) {
    const match = getHijriMonthDays(year, month).find(date => date.hijriDay === day);
    return match ? toGregorianStr(match.date) : value;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
