import type { QuickSale } from "@workspace/api-client-react";
import { includeQuickSalesInReport, type ServiceFinancialReport } from "./financialReportActivity";
import { isInRevenuePeriod, type RevenuePeriod } from "./revenuePeriod";
import type { RevenueSource } from "./quickSalesRevenue";

export const serviceReportSourceLabels: Record<RevenueSource, string> = {
  all: "الحجوزات والمبيعات الفردية معًا",
  bookings: "الحجوزات فقط",
  quick_sales: "المبيعات الفردية فقط",
};

export type ServiceReportExpense = {
  id: number; providerId?: number | null; submissionId?: number | null;
  dateStr: string; amount: string | number; category: string;
  customCategory?: string | null; notes?: string | null;
};

export function serviceExpensesForPeriod<T extends ServiceReportExpense>(expenses: T[], providerId: number, period: RevenuePeriod) {
  // Unallocated owner/property expenses are not arbitrarily distributed to services.
  return expenses.filter(expense => expense.providerId === providerId && isInRevenuePeriod(expense.dateStr, period));
}

export function buildServiceFinancialReport(summary: ServiceFinancialReport | undefined, sales: QuickSale[],
  expenses: ServiceReportExpense[], source: RevenueSource) {
  const bookings = source === "quick_sales"
    ? { totalRevenue: 0, totalDeposits: 0, totalInsurance: 0, byProvider: [] }
    : summary;
  const revenue = includeQuickSalesInReport(bookings, source === "bookings" ? [] : sales);
  if (!revenue) return undefined;
  const expenseCents = expenses.reduce((sum, expense) => sum + Math.round(Number(expense.amount) * 100), 0);
  return { ...revenue, totalExpenses: expenseCents / 100,
    netProfit: (Math.round(revenue.totalRevenue * 100) - expenseCents) / 100 };
}

export function serviceReportRows(report: NonNullable<ReturnType<typeof buildServiceFinancialReport>>, source: RevenueSource) {
  return [
    ...(source !== "quick_sales" ? [{ label: "إيرادات حجوزات الخدمات الأساسية", amount: report.bookingRevenue }] : []),
    ...(source !== "bookings" ? [{ label: "إيرادات المبيعات الفردية (البيع السريع)", amount: report.quickSalesRevenue }] : []),
    { label: "إجمالي إيرادات النطاق المختار", amount: report.totalRevenue },
    ...(source !== "quick_sales" ? [
      { label: "عربون محصّل (ضمن إيرادات الحجوزات)", amount: report.totalDeposits },
      { label: "التأمينات (ليست إيرادًا)", amount: report.totalInsurance },
    ] : []),
    { label: "المصروفات المسجلة للخدمة", amount: report.totalExpenses },
    { label: "صافي الربح / الدخل النهائي", amount: report.netProfit },
  ];
}
