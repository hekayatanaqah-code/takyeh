import type { QuickSale } from "@workspace/api-client-react";
import type { DashboardActivity } from "./dashboardActivity";
import { isInRevenuePeriod, type RevenuePeriod } from "./revenuePeriod";

export type RevenueSource = "all" | "bookings" | "quick_sales";

export function revenueSourceOptions(propertyOnly: boolean): [RevenueSource, string][] {
  return propertyOnly ? [["bookings", "الحجوزات فقط"]]
    : [["all", "الحجوزات والمبيعات المفردة"], ["bookings", "الحجوزات فقط"], ["quick_sales", "المبيعات المفردة فقط"]];
}

export function effectiveRevenueSource(selected: RevenueSource, propertyOnly: boolean): RevenueSource {
  return propertyOnly ? "bookings" : selected;
}

export function quickSalesForPeriod(sales: QuickSale[], activity: DashboardActivity, period: RevenuePeriod) {
  if (activity.type === "chalet") return [];
  return sales.filter(sale => sale.status === "completed"
    && (activity.type === "all" || sale.providerId === activity.id)
    && isInRevenuePeriod(sale.dateStr, period));
}

export function quickSalesTotal(sales: QuickSale[]) {
  // Sum cents so fractional prices retain their accounting value.
  return sales.reduce((cents, sale) => cents + Math.round(sale.total * 100), 0) / 100;
}
