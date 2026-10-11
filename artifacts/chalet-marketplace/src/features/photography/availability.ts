import type { Interval } from "./shared";

export const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 60, label: "ساعة" },
  { value: 90, label: "ساعة ونصف" },
  { value: 120, label: "ساعتان" },
  { value: 180, label: "٣ ساعات" },
  { value: 240, label: "٤ ساعات" },
];
export const isSupportedDuration = (m: number) => DURATION_OPTIONS.some((o) => o.value === m);

/** Group intervals by weekday (0..6), preserving order. Absent weekday = disabled. */
export function byWeekday(v: Interval[]): Interval[][] {
  const out: Interval[][] = Array.from({ length: 7 }, () => []);
  for (const x of v) if (x.weekday >= 0 && x.weekday <= 6) out[x.weekday].push(x);
  return out;
}
export const flattenWeek = (rows: Interval[][]): Interval[] => rows.flat();

/** Today's date in Asia/Riyadh as YYYY-MM-DD. */
export function riyadhToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Month grid cells (Sunday-first), null for leading blanks. m is 0-based. */
export function monthCells(y: number, m: number): (string | null)[] {
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return [...Array.from({ length: first }, () => null), ...Array.from({ length: days }, (_, i) => ymd(y, m, i + 1))];
}
export function toggleDate(list: string[], d: string): string[] {
  return list.includes(d) ? list.filter((x) => x !== d) : [...list, d].sort();
}
