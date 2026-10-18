import assert from "node:assert/strict";
import { test } from "node:test";
import { isExpenseInScope } from "./expenseScope";
import { bankLedgerTotals, buildBankLedger } from "./bankLedger";

const salary = { id: 1, submissionId: null, providerId: null, category: "salaries", customCategory: null, amount: "2500.75", dateStr: "2026-10-18", notes: "راتب الموظف - موظف اختبار" };

test("owner-wide payroll remains visible in all, selected property and selected service views", () => {
  assert.equal(isExpenseInScope(salary, { type: "all" }), true);
  assert.equal(isExpenseInScope(salary, { type: "chalet", submissionId: 7 }), true);
  assert.equal(isExpenseInScope(salary, { type: "service", id: 9 }), true);
});

test("selected providers never see another provider's payroll or general owner cash expenses", () => {
  assert.equal(isExpenseInScope({ ...salary, providerId: 10 }, { type: "service", id: 9 }), false);
  assert.equal(isExpenseInScope({ ...salary, category: "maintenance" }, { type: "service", id: 9 }), false);
  assert.equal(isExpenseInScope({ ...salary, submissionId: 8 }, { type: "chalet", submissionId: 7 }), false);
  assert.equal(isExpenseInScope({ ...salary, providerId: 9 }, { type: "chalet", submissionId: 7 }), false);
});

test("same salary expense is deducted once, with halalas, in each bank-ledger scope", () => {
  for (const scope of [{ type: "all" }, { type: "chalet", submissionId: 7 }, { type: "service", id: 9 }] as const) {
    const entries = buildBankLedger({ scope, expenses: [salary], bookings: [], payments: [], deposits: [] });
    assert.equal(entries.length, 1);
    assert.equal(entries[0].description, "salaries — راتب الموظف - موظف اختبار");
    assert.deepEqual(bankLedgerTotals(entries), { deposited: 0, withdrawn: 2500.75, balance: -2500.75 });
  }
});
