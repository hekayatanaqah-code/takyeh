import { hasServiceInsurance, type ServiceCapabilities } from "./serviceDashboardTabs";

export type CustomerHistoryTab = "bookings" | "contracts" | "insurance";
export function customerHistoryTabs(
  profile: { totalBookings: number; totalSales?: number; contractCount: number; insuranceCount: number },
  providerId?: number,
  capabilities?: ServiceCapabilities,
) {
  const tabs: { id: CustomerHistoryTab; label: string; count: number }[] = [
    { id: "bookings", label: providerId ? "الحجوزات والمبيعات" : "سجل الحجوزات", count: profile.totalBookings + (profile.totalSales ?? 0) },
  ];
  // A service must explicitly enable the feature; historical records alone do not enable it.
  if (!providerId || (profile.contractCount > 0 && capabilities?.requiresContract === true)) {
    tabs.push({ id: "contracts", label: "العقود الرقمية", count: profile.contractCount });
  }
  if (!providerId || (profile.insuranceCount > 0 && capabilities && hasServiceInsurance(capabilities))) {
    tabs.push({ id: "insurance", label: "سجل التأمينات", count: profile.insuranceCount });
  }
  return tabs;
}

export function resolveCustomerHistoryTab(requested: CustomerHistoryTab, tabs: { id: CustomerHistoryTab }[]): CustomerHistoryTab {
  return tabs.some(tab => tab.id === requested) ? requested : "bookings";
}
