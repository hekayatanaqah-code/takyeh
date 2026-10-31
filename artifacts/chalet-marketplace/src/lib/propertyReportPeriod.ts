/** Use recorded property dates, not the selected calendar/month, for all-history reports. */
export function propertyReportAllPeriodBounds(
  bookings: readonly { bookingDate?: string | null; submissionId?: number | null; cancelledAt?: unknown }[],
  expenses: readonly { dateStr?: string | null; submissionId?: number | null }[],
  submissionId: string,
  today: string,
) {
  const matches = (id: number | null | undefined) => submissionId === "all" || String(id) === submissionId;
  const dates = [
    ...bookings.filter(b => !b.cancelledAt && matches(b.submissionId)).map(b => b.bookingDate),
    ...expenses.filter(e => e.submissionId == null || matches(e.submissionId)).map(e => e.dateStr),
  ].filter((date): date is string => !!date && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  return { from: dates[0] ?? today, to: dates[dates.length - 1] ?? today };
}
