import type { DashboardActivity } from "./dashboardActivity";
import { isInRevenuePeriod, type RevenuePeriod } from "./revenuePeriod";

export interface ServiceRevenueAppointment {
  id: number;
  providerId: number;
  dateStr?: string | null;
  status?: string | null;
  amount?: string | number | null;
  deposit?: string | number | null;
}

/** Scope first, then use the same calendar boundaries as property revenue. */
export function serviceRevenueBookings<T extends ServiceRevenueAppointment>(
  appointments: T[], activity: DashboardActivity, period: RevenuePeriod,
): T[] {
  if (activity.type === "chalet") return [];
  return appointments.filter(a =>
    (activity.type === "all" || a.providerId === activity.id)
    && a.status !== "cancelled"
    && isInRevenuePeriod(a.dateStr, period));
}

export function serviceRevenueTotals(appointments: ServiceRevenueAppointment[]) {
  return appointments.reduce((totals, a) => {
    const amount = Number(a.amount ?? 0);
    const deposit = Number(a.deposit ?? 0);
    totals.sales += amount;
    totals.collected += deposit;
    totals.pending += Math.max(0, amount - deposit);
    return totals;
  }, { sales: 0, collected: 0, pending: 0 });
}
