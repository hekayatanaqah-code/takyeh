/** Request timestamps share one Saudi-local day and explicit calendar definitions. */
export function submissionDualDate(value: string | null | undefined): { hijri: string; gregorian: string } | null {
  if (!value?.trim()) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00+03:00` : value);
  if (Number.isNaN(date.getTime())) return null;
  const format = (calendar: "gregory" | "islamic-umalqura", era: string) =>
    new Intl.DateTimeFormat("ar-SA", {
      calendar, numberingSystem: "arab", timeZone: "Asia/Riyadh",
      day: "numeric", month: "long", year: "numeric",
    }).formatToParts(date).filter(part => part.type !== "era").map(part => part.value).join("").trim() + ` ${era}`;
  return { hijri: format("islamic-umalqura", "هـ"), gregorian: format("gregory", "م") };
}
