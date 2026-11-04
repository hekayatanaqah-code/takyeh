import assert from "node:assert/strict";
import test from "node:test";
import { inFinancialSelection, expenseInFinancialSelection, financialSelectionKey,
  mergeFinancialTransactions, transactionChannels, serviceInsuranceCustody, type FinancialSelection } from "./financialSelection";
import { transactionHistoryTotals, type FinancialTransaction } from "./transactionHistory";
import { isInRevenuePeriod } from "./revenuePeriod";
import { revenueFilterPeriod } from "./revenueFilterPeriod";
import { buildActivitySummaryReportHtml } from "./financialReport";

const selection: FinancialSelection = [
  { type: "chalet", id: 1, submissionId: 101, name: "العقار الأول" },
  { type: "chalet", id: 2, submissionId: 102, name: "العقار الثاني" },
  { type: "service", id: 1, name: "الخدمة الأولى" },
];
const row = (id: string, amount: number, extra: Partial<FinancialTransaction> = {}): FinancialTransaction => ({
  id, date: "2026-11-04", type: "income", label: "إيراد تجريبي في الذاكرة فقط",
  amount, method: "transfer", status: "collected", cashDeposited: false, ...extra,
});

test("mixed selection matches submission/provider identities, never numeric IDs from the other product", () => {
  assert.equal(inFinancialSelection({ submissionId: 101 }, selection), true);
  assert.equal(inFinancialSelection({ submissionId: 102 }, selection), true);
  assert.equal(inFinancialSelection({ providerId: 1 }, selection), true);
  assert.equal(inFinancialSelection({ submissionId: 1 }, selection), false);
  assert.equal(inFinancialSelection({ providerId: 2 }, selection), false);
  assert.equal(inFinancialSelection({ submissionId: 103 }, selection), false);
  assert.equal(inFinancialSelection({}, []), false);
  assert.equal(inFinancialSelection({}, null), true);
});

test("selection keys are independent of choice order and preserve product identity", () => {
  assert.equal(financialSelectionKey(selection), financialSelectionKey([...selection!].reverse()));
  assert.notEqual(financialSelectionKey([selection![0]]), financialSelectionKey([selection![2]]));
  assert.notEqual(financialSelectionKey([]), financialSelectionKey(null));
});

test("expenses respect activity ownership; shared salaries are included without cross-product leakage", () => {
  const serviceOnly = [selection![2]];
  const propertyOnly = [selection![0]];
  assert.equal(expenseInFinancialSelection({ submissionId: null, providerId: 1, category: "supplies" }, serviceOnly), true);
  assert.equal(expenseInFinancialSelection({ submissionId: null, providerId: 1, category: "supplies" }, propertyOnly), false);
  assert.equal(expenseInFinancialSelection({ submissionId: 101, category: "maintenance" }, serviceOnly), false);
  assert.equal(expenseInFinancialSelection({ submissionId: null, category: "salaries" }, serviceOnly), true);
  assert.equal(expenseInFinancialSelection({ submissionId: null, category: "salaries" }, []), false);
});

test("two properties plus one service count shared expenses once, retain cancellation income and exclude cancelled sales", () => {
  const salary = row("e-10", 70.15, { type: "expense" });
  const movements = mergeFinancialTransactions([
    [row("b-1", 100.10), salary],
    [row("b-2", 200.20), salary],
    [row("s-1", 300.30), row("s-1-ref", 50.05, { type: "refund" }),
      row("q-1", 40.40), row("q-2", 999, { status: "cancelled" }), salary],
  ]);
  assert.equal(movements.filter(item => item.id === salary.id).length, 1);
  assert.deepEqual(transactionHistoryTotals(movements), {
    income: 590.95, refunds: 50.05, expenses: 70.15, receivables: 0, net: 520.8,
  });
  assert.deepEqual(transactionChannels(movements), { bank: 590.95, depositedCash: 0, cash: 0 });
});

test("channels separate bank, deposited cash and outstanding cash without treating deposits as new revenue", () => {
  const rows = [row("bank", 12.12), row("cash", 30.30, { method: "cash" }),
    row("cash-refund", 5.05, { type: "refund", method: "cash" }),
    row("deposited", 40.40, { method: "cash", cashDeposited: true }),
    row("cancelled-sale", 999, { status: "cancelled" }),
    row("expense", 99, { type: "expense" })];
  assert.deepEqual(transactionChannels(rows), { bank: 12.12, cash: 25.25, depositedCash: 40.4 });
});

test("held insurance is independently scoped and never increases collected income", () => {
  const period = revenueFilterPeriod("monthly", "gregorian", "2026", "2026-11", "", "");
  const custody = serviceInsuranceCustody([
    { dateStr: "2026-11-04", insuranceAmount: 100, insuranceStatus: "held", insuranceDeductAmount: 10 },
    { dateStr: "2026-11-04", insuranceAmount: 50, insuranceStatus: null },
    { dateStr: "2026-11-04", insuranceAmount: 900, insuranceStatus: "refunded" },
    { dateStr: "2026-11-04", insuranceAmount: 900, insuranceStatus: "deducted" },
    { dateStr: "2026-10-04", insuranceAmount: 900, insuranceStatus: "held" },
  ], period);
  assert.equal(custody, 140);
  assert.equal(transactionHistoryTotals([row("principal", 25)]).income, 25);
});

test("the same financial rows support monthly, yearly, custom and all-period report boundaries", () => {
  const dates = ["2025-11-04", "2026-10-31", "2026-11-01", "2026-11-04", "2026-11-05"];
  const count = (mode: "monthly" | "yearly" | "custom" | "all", from = "", to = "") =>
    dates.filter(date => isInRevenuePeriod(date, revenueFilterPeriod(mode, "gregorian", "2026", "2026-11", from, to))).length;
  assert.equal(count("monthly"), 3);
  assert.equal(count("yearly"), 4);
  assert.equal(count("custom", "2026-11-01", "2026-11-04"), 2);
  assert.equal(count("all"), 5);
});

test("grouped printable reports use the exact deduplicated closing amounts and escape activity names", () => {
  const totals = transactionHistoryTotals(mergeFinancialTransactions([[row("s-1", 25.25)], [row("s-1", 25.25)]]));
  const html = buildActivitySummaryReportHtml({ title: "التقرير المالي - <نشاط>", activityName: "<نشاط>",
    period: "جميع الفترات", fileName: "التقرير المالي.pdf", forPrint: true, css: "", logo: null,
    rows: [{ label: "صافي الدخل النهائي", amount: totals.net }],
    closingRows: [{ label: "صافي الدخل النهائي", amount: totals.net }],
  });
  assert.match(html, /&lt;نشاط&gt;/);
  assert.doesNotMatch(html, /<نشاط>/);
  assert.equal(totals.net, 25.25);
  assert.match(html, /صافي الدخل النهائي/);
});
