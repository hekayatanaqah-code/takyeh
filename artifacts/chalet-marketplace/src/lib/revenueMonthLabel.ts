import { getHijriMonthGregorianRange, HIJRI_MONTHS_AR, toHijriComponents } from "./hijri";
import type { RevenuePeriod } from "./revenuePeriod";

const ar = (value: number) => value.toLocaleString("ar-SA", { useGrouping: false });

/** Shared month labels for revenue and quick-sale history, with the other calendar below. */
export function revenueMonthLabel(monthKey: string, calendar: RevenuePeriod["calendar"]) {
  const [year, month] = monthKey.split("-").map(Number);
  if (calendar === "hijri") {
    const range = getHijriMonthGregorianRange(year, month);
    let secondary = "";
    if (range.start && range.end) {
      const start = new Date(`${range.start}T12:00:00`);
      const end = new Date(`${range.end}T12:00:00`);
      const startName = start.toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });
      const endName = end.toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });
      secondary = start.getFullYear() !== end.getFullYear()
        ? `${startName} ${ar(start.getFullYear())} / ${endName} ${ar(end.getFullYear())}`
        : start.getMonth() === end.getMonth()
          ? `${startName} ${ar(start.getFullYear())}`
          : `${startName} / ${endName} ${ar(end.getFullYear())}`;
    }
    return { primary: `${HIJRI_MONTHS_AR[month - 1]} ${ar(year)} هـ`, secondary };
  }
  const first = toHijriComponents(new Date(year, month - 1, 1));
  const last = toHijriComponents(new Date(year, month, 0));
  const secondary = first.year === last.year && first.month === last.month
    ? `${HIJRI_MONTHS_AR[first.month - 1]} ${ar(first.year)} هـ`
    : first.year === last.year
      ? `${HIJRI_MONTHS_AR[first.month - 1]} / ${HIJRI_MONTHS_AR[last.month - 1]} ${ar(first.year)} هـ`
      : `${HIJRI_MONTHS_AR[first.month - 1]} ${ar(first.year)} / ${HIJRI_MONTHS_AR[last.month - 1]} ${ar(last.year)} هـ`;
  return {
    primary: new Date(year, month - 1, 15).toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" }),
    secondary,
  };
}
