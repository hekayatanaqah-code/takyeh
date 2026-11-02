import { financialEventDate, isPropertyExpense } from "./financialPrincipal";
/** Cancellations belong to their financial event date, not the cancelled future stay. */
export function propertyReportAllPeriodBounds(
  bookings: readonly { bookingDate?: string | null; submissionId?: number | null; cancelledAt?: unknown }[],
  expenses: readonly { dateStr?: string | null; submissionId?: number | null; providerId?: number | null }[],
  submissionId: string,
  today: string,
) {
  const matches = (id: number | null | undefined) => submissionId === "all" || String(id) === submissionId;
  const dates = [
    ...bookings.filter(b => matches(b.submissionId)).map(b => b.cancelledAt ? financialEventDate(b.cancelledAt as string | Date) : b.bookingDate),
    ...expenses.filter(e => isPropertyExpense(e) && (e.submissionId == null || matches(e.submissionId))).map(e => e.dateStr),
  ].filter((date): date is string => !!date && /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  return { from: dates[0] ?? today, to: dates[dates.length - 1] ?? today };
}
