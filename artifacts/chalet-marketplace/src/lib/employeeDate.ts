import { toGregorianStr } from "./hijri";

/** Historical employee dates, not future booking dates. No minimum employment age is imposed. */
export function employeeDateBounds(kind: "birth" | "hire", today = new Date()) {
  const earliest = new Date(today.getFullYear() - (kind === "birth" ? 120 : 100), 0, 1, 12);
  const initial = kind === "birth"
    ? new Date(today.getFullYear() - 25, 0, 1, 12)
    : today;
  return {
    minDate: toGregorianStr(earliest),
    maxDate: toGregorianStr(today),
    initialDate: toGregorianStr(initial),
  };
}
