import type { DashboardActivity } from "./dashboardActivity";
import type { QuickSale } from "@workspace/api-client-react";
import { quickSalesTotal } from "./quickSalesRevenue";

export function loneFinancialReportActivity(
  properties: { id: number; submissionId?: number | null; nameAr?: string | null }[],
  services: { id: number; businessName?: string | null }[],
): DashboardActivity | null {
  if (properties.length + services.length !== 1) return null;
  if (services.length) return { type: "service", id: services[0].id, name: services[0].businessName || "خدمة" };
  return { type: "chalet", id: properties[0].id, submissionId: properties[0].submissionId ?? undefined, name: properties[0].nameAr || "عقار" };
}

export function defaultFinancialReportActivity(
  current: DashboardActivity,
  properties: { id: number; submissionId?: number | null; nameAr?: string | null }[],
  services: { id: number; businessName?: string | null }[],
): DashboardActivity {
  if (current.type !== "all") return current;
  if (properties.length + services.length !== 1) return current;
  if (services.length) return { type: "service", id: services[0].id, name: services[0].businessName || "خدمة" };
  return { type: "chalet", id: properties[0].id, submissionId: properties[0].submissionId ?? undefined, name: properties[0].nameAr || "عقار" };
}

/** The summary contains booking collections only; add completed sales once, in halalas. */
export function includeQuickSalesInReport(summary: ServiceFinancialReport | undefined, sales: QuickSale[]) {
  if (!summary) return undefined;
  const completed = sales.filter(sale => sale.status === "completed");
  const byProvider = summary.byProvider.map(provider => ({ ...provider }));
  for (const sale of completed) {
    let provider = byProvider.find(provider => provider.id === sale.providerId);
    if (!provider) {
      provider = { id: sale.providerId, name: sale.providerName, revenue: 0, deposits: 0, insurance: 0 };
      byProvider.push(provider);
    }
    provider.revenue = (Math.round(provider.revenue * 100) + Math.round(sale.total * 100)) / 100;
  }
  const quickSalesRevenue = quickSalesTotal(completed);
  return {
    ...summary, byProvider, bookingRevenue: summary.totalRevenue, quickSalesRevenue,
    totalRevenue: (Math.round(summary.totalRevenue * 100) + Math.round(quickSalesRevenue * 100)) / 100,
  };
}

export function financialReportTitle(activity: DashboardActivity) {
  return `التقرير المالي - ${activity.type === "all" ? "جميع الأنشطة" : activity.name}`;
}

export function escapeFinancialReportText(value: string) {
  return value.replace(/[&<>"']/g, character =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

type ServiceReportRow = { id: number; name: string; revenue: number; deposits: number; insurance: number };
export type ServiceFinancialReport = {
  totalRevenue: number; totalDeposits: number; totalInsurance: number; byProvider: ServiceReportRow[];
};

export function scopeServiceFinancialReport(summary: ServiceFinancialReport | undefined, activity: DashboardActivity) {
  if (!summary || activity.type !== "service") return summary;
  const byProvider = summary.byProvider.filter(provider => provider.id === activity.id);
  return {
    byProvider,
    totalRevenue: byProvider.reduce((sum, provider) => sum + provider.revenue, 0),
    totalDeposits: byProvider.reduce((sum, provider) => sum + provider.deposits, 0),
    totalInsurance: byProvider.reduce((sum, provider) => sum + provider.insurance, 0),
  };
}
