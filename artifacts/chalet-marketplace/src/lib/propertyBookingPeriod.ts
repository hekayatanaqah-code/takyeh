const PERIOD_NAMES = {
  morning: "صباحي",
  evening: "مسائي",
  fullday: "يوم كامل",
} as const;

export function normalizePropertyBookingPeriod(value: string | null | undefined): keyof typeof PERIOD_NAMES | null {
  const period = value?.trim();
  if (period === "full_day" || period === "fullday") return "fullday";
  return period === "morning" || period === "evening" ? period : null;
}

export function propertyBookingPeriodName(value: string | null | undefined): string {
  const period = normalizePropertyBookingPeriod(value);
  return period ? PERIOD_NAMES[period] : "غير محددة";
}
