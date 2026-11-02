import type { DashboardActivity } from "./dashboardActivity";
import { expenseTarget } from "./expenseTarget";

/** A withdrawal must retain the selected activity's real accounting identity. */
export function createWithdrawalExpense(
  activity: DashboardActivity,
  input: { amount: number; dateStr: string; notes?: string },
) {
  if (activity.type === "all") throw new Error("اختر العقار أو الخدمة المراد تسجيل السحب عليها.");
  const amount = Math.round(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("أدخل مبلغ سحب صحيحاً أكبر من صفر.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dateStr)) throw new Error("اختر تاريخ السحب.");
  return {
    category: "withdrawal",
    amount,
    dateStr: input.dateStr,
    notes: input.notes || undefined,
    ...expenseTarget(activity),
  };
}
