import { test } from "node:test";
import assert from "node:assert/strict";
import { transactionHistoryTotals, type FinancialTransaction } from "./transactionHistory";

function row(patch: Partial<FinancialTransaction>): FinancialTransaction {
  return { id: "one", date: "2026-11-01", type: "income", label: "حركة اختبار", amount: 0,
    method: "cash", status: "collected", cashDeposited: false, ...patch };
}
test("summary uses the displayed records, preserves halalas, and excludes cancelled sales and unpaid balances from income", () => {
  assert.deepEqual(transactionHistoryTotals([
    row({ amount: 200.10, remainingBalance: 499.9 }),
    row({ id: "service", amount: 100.20, remainingBalance: 199.8 }),
    row({ id: "sale", amount: 25.45 }),
    row({ id: "cancelled", amount: 500, status: "cancelled" }),
    row({ id: "expense", type: "expense", amount: 50.15 }),
    row({ id: "withdrawal", type: "withdrawal", amount: 10.10 }),
    row({ id: "refund", type: "refund", amount: 20.25 }),
  ]), { income: 325.75, expenses: 60.25, refunds: 20.25, receivables: 699.7, net: 245.25 });
});
test("period filters and losses use the exact same arithmetic as cards", () => {
  const items = [row({ date: "2026-10-01", amount: 100 }), row({ date: "2026-11-01", type: "expense", amount: 30.50 })];
  assert.equal(transactionHistoryTotals(items.filter(item => item.date.startsWith("2026-11"))).net, -30.5);
  assert.equal(transactionHistoryTotals(items).net, 69.5);
  assert.throws(() => transactionHistoryTotals([row({ amount: Number.NaN })]), /غير صحيحة/);
});
