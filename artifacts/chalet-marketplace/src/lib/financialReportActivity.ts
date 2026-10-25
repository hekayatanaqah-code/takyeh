import type { DashboardActivity } from "./dashboardActivity";

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
