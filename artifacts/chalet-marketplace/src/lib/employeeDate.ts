import { toGregorianStr } from "./hijri";

/** Saudi civil day, independent of the device's timezone. */
export function employeeToday(now = new Date()) {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Historical employee dates, not future booking dates. No minimum employment age is imposed. */
export function employeeDateBounds(kind: "birth" | "hire", today = new Date()) {
  const todayStr = employeeToday(today);
  const year = Number(todayStr.slice(0, 4));
  const earliest = new Date(year - (kind === "birth" ? 120 : 100), 0, 1, 12);
  const initial = kind === "birth"
    ? toGregorianStr(new Date(year - 25, 0, 1, 12))
    : todayStr;
  return {
    minDate: toGregorianStr(earliest),
    maxDate: todayStr,
    initialDate: initial,
  };
}
