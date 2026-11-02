import type { OwnerLedgerTransaction } from "@workspace/api-client-react";
export type FinancialTransaction = OwnerLedgerTransaction;

export function transactionHistoryTotals(items: FinancialTransaction[]) {
  let income = 0, expenses = 0, refunds = 0, receivables = 0;
  for (const item of items) {
    if (item.status === "cancelled") continue;
    const amount = Math.round(item.amount * 100);
    const remaining = Math.round((item.remainingBalance ?? 0) * 100);
    if (!Number.isSafeInteger(amount) || !Number.isSafeInteger(remaining)) throw new Error("قيمة مالية غير صحيحة");
    if (item.type === "income") { income += amount; receivables += remaining; }
    else if (item.type === "refund") refunds += amount;
    else if (item.type === "expense" || item.type === "withdrawal") expenses += amount;
  }
  return { income: (income - refunds) / 100, expenses: expenses / 100, refunds: refunds / 100,
    receivables: receivables / 100, net: (income - expenses - refunds) / 100 };
}
