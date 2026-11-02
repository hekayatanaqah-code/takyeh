import type { DashboardActivity } from "./dashboardActivity";
import { isInRevenuePeriod, type RevenuePeriod } from "./revenuePeriod";
import { servicePrincipal } from "./financialPrincipal";

export interface ServiceRevenueAppointment {
  id: number;
  providerId: number;
  dateStr?: string | null;
  status?: string | null;
  amount?: string | number | null;
  deposit?: string | number | null;
  cancelledAt?: string | Date | null;
  cancelRefundAmount?: string | number | null;
}

/** Scope first, then use the same calendar boundaries as property revenue. */
export function serviceRevenueBookings<T extends ServiceRevenueAppointment>(
  appointments: T[], activity: DashboardActivity, period: RevenuePeriod,
): T[] {
  if (activity.type === "chalet") return [];
  return appointments.filter(a =>
    (activity.type === "all" || a.providerId === activity.id)
    && (a.status !== "cancelled" || servicePrincipal(a).collected > 0)
    && isInRevenuePeriod(servicePrincipal(a).date, period));
}

export function serviceRevenueTotals(appointments: ServiceRevenueAppointment[]) {
  return appointments.reduce((totals, a) => {
    const principal = servicePrincipal(a);
    totals.sales += principal.contractual;
    totals.collected += principal.collected;
    totals.pending += principal.outstanding;
    return totals;
  }, { sales: 0, collected: 0, pending: 0 });
}
