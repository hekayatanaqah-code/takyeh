import { getHijriMonthGregorianRange } from "./hijri";

/** List every month touched by the selected period, including year boundaries. */
export function financialMonthCounterpart(key: string, hijri: boolean): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return "";
  const [year, month] = key.split("-").map(Number);
  let start: Date;
  let end: Date;
  if (hijri) {
    const range = getHijriMonthGregorianRange(year, month);
    if (!range.start || !range.end) return "";
    start = new Date(`${range.start}T12:00:00+03:00`);
    end = new Date(`${range.end}T12:00:00+03:00`);
  } else {
    start = new Date(Date.UTC(year, month - 1, 1, 9));
    end = new Date(Date.UTC(year, month, 0, 9));
  }
  const formatter = new Intl.DateTimeFormat("ar-SA", {
    calendar: hijri ? "gregory" : "islamic-umalqura",
    numberingSystem: "arab", month: "long", year: "numeric", timeZone: "Asia/Riyadh",
  });
  const labels = new Set<string>();
  for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    const parts = formatter.formatToParts(day);
    const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
    labels.add(`${get("month")} ${get("year")} ${hijri ? "م" : "هـ"}`);
  }
  return `يوافق: ${[...labels].join(" / ")}`;
}
