import { activityKey, type DashboardActivity } from "./dashboardActivity";
import { isExpenseInScope } from "./expenseScope";
import type { FinancialTransaction } from "./transactionHistory";
import { isInRevenuePeriod, type RevenuePeriod } from "./revenuePeriod";

export type FinancialSelection = Exclude<DashboardActivity, { type: "all" }>[] | null;

/** null means all; an empty explicit selection must never broaden the scope. */
export function inFinancialSelection(
  row: { submissionId?: number | null; providerId?: number | null },
  selection: FinancialSelection,
) {
  return selection === null || selection.some(activity => activity.type === "service"
    ? row.providerId === activity.id
    : row.providerId == null && activity.submissionId != null && row.submissionId === activity.submissionId);
}

export function expenseInFinancialSelection(
  expense: { submissionId: number | null; providerId?: number | null; category: string },
  selection: FinancialSelection,
) {
  return selection === null || selection.some(activity => isExpenseInScope(expense, activity));
}

export function financialSelectionKey(selection: FinancialSelection) {
  return selection === null ? "all" : [...new Set(selection.map(activityKey))].sort().join("|");
}

/** Shared salaries/general expenses appear in multiple unit responses; count each row once. */
export function mergeFinancialTransactions(groups: FinancialTransaction[][]) {
  return [...new Map(groups.flat().map(row => [row.id, row])).values()]
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function transactionChannels(rows: FinancialTransaction[]) {
  const totals = { bank: 0, depositedCash: 0, cash: 0 };
  for (const row of rows) {
    if (row.status === "cancelled" || (row.type !== "income" && row.type !== "refund")) continue;
    const cents = Math.round(row.amount * 100) * (row.type === "refund" ? -1 : 1);
    if (!Number.isSafeInteger(cents)) throw new Error("قيمة مالية غير صحيحة");
    if (row.method !== "cash") totals.bank += cents;
    else if (row.cashDeposited) totals.depositedCash += cents;
    else totals.cash += cents;
  }
  return Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / 100])) as typeof totals;
}

export function serviceInsuranceCustody(bookings: {
  dateStr?: string | null; insuranceAmount?: string | number | null;
  insuranceStatus?: string | null; insuranceDeductAmount?: string | number | null;
}[], period: RevenuePeriod) {
  return bookings.filter(booking => booking.dateStr && isInRevenuePeriod(booking.dateStr, period)
    && (!booking.insuranceStatus || booking.insuranceStatus === "held"))
    .reduce((cents, booking) => {
      const amount = Math.round(Number(booking.insuranceAmount ?? 0) * 100);
      const deduction = Math.round(Number(booking.insuranceDeductAmount ?? 0) * 100);
      if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(deduction)) throw new Error("قيمة تأمين غير صحيحة");
      return cents + Math.max(0, amount - deduction);
    }, 0) / 100;
}
