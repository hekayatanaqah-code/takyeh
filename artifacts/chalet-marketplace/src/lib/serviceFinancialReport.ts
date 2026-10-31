import type { QuickSale } from "@workspace/api-client-react";
import { includeQuickSalesInReport, type ServiceFinancialReport } from "./financialReportActivity";
import { isInRevenuePeriod, type RevenuePeriod } from "./revenuePeriod";
import type { RevenueSource } from "./quickSalesRevenue";
import { matchesPropertyPaymentFilter, type PropertyPaymentFilter } from "./propertyBookingStatus";

export type ServiceReportMode = "compact" | "detailed";
export type ServiceReportPeriodMode = "monthly" | "yearly" | "custom";

/** Custom dates stay ISO internally even when the picker displays Hijri. */
export function serviceReportPeriodForView(
  mode: ServiceReportPeriodMode, calendar: RevenuePeriod["calendar"],
  month: string, year: string, from: string, to: string,
): RevenuePeriod {
  if (mode === "custom") return { calendar, year: "", month: "", range: { from, to } };
  return { calendar, year: mode === "monthly" ? month.slice(0, 4) : year,
    month: mode === "monthly" ? month : "" };
}
export type ServiceReportBooking = {
  id: number; providerId: number; dateStr: string; status: string;
  amount?: string | number | null; deposit?: string | number | null;
  insuranceAmount?: string | number | null; clientName?: string;
  notes?: string | null; startTime?: string | null;
};
export const serviceReportPaymentLabels: Record<PropertyPaymentFilter, string> = {
  all: "الكل", unpaid: "متبقي عليه مبالغ", paid: "مسدد بالكامل",
};

/** One scope for details and totals; insurance never participates in settlement. */
export function serviceBookingReport<T extends ServiceReportBooking>(
  appointments: T[], providerId: number, period: RevenuePeriod, payment: PropertyPaymentFilter,
) {
  const bookings = appointments.filter(booking => booking.providerId === providerId && booking.status !== "cancelled"
    && isInRevenuePeriod(booking.dateStr, period)
    && matchesPropertyPaymentFilter({ totalPrice: booking.amount, depositPaid: booking.deposit }, payment));
  const hasInvalidAmounts = bookings.some(booking => booking.amount == null || booking.amount === ""
    || !Number.isFinite(Number(booking.amount)) || Number(booking.amount) < 0
    || !Number.isFinite(Number(booking.deposit ?? 0)) || Number(booking.deposit ?? 0) < 0);
  let collected = 0, contractual = 0, outstanding = 0, insurance = 0;
  for (const booking of bookings) {
    const amount = Math.round(Number(booking.amount ?? 0) * 100);
    const paid = Math.round(Number(booking.deposit ?? 0) * 100);
    collected += paid;
    contractual += amount;
    outstanding += Math.max(0, amount - paid);
    insurance += Math.round(Number(booking.insuranceAmount ?? 0) * 100) || 0;
  }
  return {
    bookings, hasInvalidAmounts,
    summary: {
      totalRevenue: collected / 100, totalDeposits: collected / 100, totalInsurance: insurance / 100,
      totalContractValue: contractual / 100, totalOutstanding: outstanding / 100, byProvider: [],
    },
  };
}

export function serviceSalesForPaymentFilter<T extends QuickSale>(sales: T[], payment: PropertyPaymentFilter) {
  return payment === "unpaid" ? [] : sales.filter(sale => sale.status === "completed");
}

/** Numeric dates prevent browser locale defaults from leaking English month/day names. */
export function serviceReportDate(dateStr: string, hijriFirst: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "—";
  const date = new Date(`${dateStr}T12:00:00+03:00`);
  if (!Number.isFinite(date.getTime())) return "—";
  const format = (calendar: string) => new Intl.DateTimeFormat(`ar-SA-u-ca-${calendar}`, {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Riyadh", numberingSystem: "arab",
  }).format(date).replace(/\s*هـ\s*/g, "").trim();
  const hijri = `${format("islamic-umalqura")} هـ`;
  const gregorian = `${format("gregory")} م`;
  return hijriFirst ? `${hijri} — ${gregorian}` : `${gregorian} — ${hijri}`;
}

export function serviceReportStatus(status: string) {
  return status === "confirmed" ? "مؤكد" : status === "pending" ? "بانتظار التأكيد" : status === "cancelled" ? "ملغى" : "غير محدد";
}

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

export function buildServiceFinancialReport(summary: (ServiceFinancialReport & { totalContractValue?: number; totalOutstanding?: number }) | undefined, sales: QuickSale[],
  expenses: ServiceReportExpense[], source: RevenueSource) {
  const bookings = source === "quick_sales"
    ? { totalRevenue: 0, totalDeposits: 0, totalInsurance: 0, byProvider: [] }
    : summary;
  const revenue = includeQuickSalesInReport(bookings, source === "bookings" ? [] : sales);
  if (!revenue) return undefined;
  const expenseCents = expenses.reduce((sum, expense) => sum + Math.round(Number(expense.amount) * 100), 0);
  const bookingContractValue = source === "quick_sales" ? 0 : summary?.totalContractValue ?? summary?.totalRevenue ?? 0;
  return { ...revenue, totalExpenses: expenseCents / 100,
    totalContractValue: (Math.round(bookingContractValue * 100) + Math.round(revenue.quickSalesRevenue * 100)) / 100,
    totalOutstanding: source === "quick_sales" ? 0 : summary?.totalOutstanding ?? 0,
    netProfit: (Math.round(revenue.totalRevenue * 100) - expenseCents) / 100 };
}

export function serviceReportRows(report: NonNullable<ReturnType<typeof buildServiceFinancialReport>>, source: RevenueSource, mode: ServiceReportMode = "detailed") {
  const totals = [
    { label: "إجمالي القيمة التعاقدية والمبيعات", amount: report.totalContractValue },
    { label: "إجمالي الإيرادات المحصلة فعليًا", amount: report.totalRevenue },
    { label: "المبالغ المتبقية لأصل الخدمة (دون التأمين)", amount: report.totalOutstanding },
  ];
  const closing = [
    { label: "المصروفات المسجلة للخدمة", amount: report.totalExpenses },
    { label: "صافي الربح / الدخل النهائي", amount: report.netProfit },
  ];
  if (mode === "compact") return [...totals, ...closing];
  return [
    ...(source !== "quick_sales" ? [{ label: "إيرادات حجوزات الخدمات الأساسية", amount: report.bookingRevenue }] : []),
    ...(source !== "bookings" ? [{ label: "إيرادات المبيعات الفردية (البيع السريع)", amount: report.quickSalesRevenue }] : []),
    ...totals,
    ...(source !== "quick_sales" ? [
      { label: "التأمينات (ليست إيرادًا)", amount: report.totalInsurance },
    ] : []),
    ...closing,
  ];
}
