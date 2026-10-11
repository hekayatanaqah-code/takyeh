export type SessionCalendarMode = "hijri" | "gregorian";

const options: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "long",
  year: "numeric",
  numberingSystem: "arab",
  timeZone: "UTC",
};
const hijri = new Intl.DateTimeFormat("ar-SA", { ...options, calendar: "islamic-umalqura" });
const gregorian = new Intl.DateTimeFormat("ar-SA", { ...options, calendar: "gregory" });
const weekday = new Intl.DateTimeFormat("ar-SA", { weekday: "long", timeZone: "UTC" });

function dateText(formatter: Intl.DateTimeFormat, date: Date, era: string) {
  const parts = formatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  // Explicit eras avoid locale-dependent omissions or duplicate Hijri era labels.
  return `${part("day")} ${part("month")} ${part("year")} ${era}`;
}

export function formatSessionCalendarDate(dateKey: string, mode: SessionCalendarMode) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const h = dateText(hijri, date, "هـ");
  const g = dateText(gregorian, date, "م");
  return {
    weekday: weekday.format(date),
    primary: mode === "hijri" ? h : g,
    secondary: mode === "hijri" ? g : h,
  };
}
