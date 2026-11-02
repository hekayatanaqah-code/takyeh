import assert from "node:assert/strict";
import { test } from "node:test";
import { createWithdrawalExpense } from "./withdrawalExpense";
import { defaultExpenseActivity } from "./expenseTarget";
import { isExpenseInScope } from "./expenseScope";
import { bankLedgerTotals, buildBankLedger } from "./bankLedger";

const service = { type: "service", id: 9, name: "خدمة اختبار" } as const;
const property = { type: "chalet", id: 40, submissionId: 7, name: "عقار اختبار" } as const;
const input = { amount: 120, dateStr: "2026-11-03", notes: "سحب شخصي" };

test("service withdrawal payload carries the provider identity and no property identity", () => {
  const payload = createWithdrawalExpense(service, input);
  assert.deepEqual(payload, {
    category: "withdrawal", ...input, providerId: 9,
  });
  assert.equal("submissionId" in payload, false);
});

test("property withdrawal retains registration identity, not the published property ID", () => {
  const payload = createWithdrawalExpense(property, input);
  assert.equal(payload.submissionId, 7);
  assert.equal("providerId" in payload, false);
});

test("a sole service displayed while internal scope is all remains the withdrawal target", () => {
  const activity = defaultExpenseActivity({ type: "all" }, [service]);
  assert.equal(createWithdrawalExpense(activity, input).providerId, 9);
  const multiple = defaultExpenseActivity({ type: "all" }, [service, property]);
  assert.throws(() => createWithdrawalExpense(multiple, input));
});

test("saved service withdrawal is visible only in its own service and the consolidated scope", () => {
  const expense = {
    id: 1, submissionId: null, providerId: null, customCategory: null,
    ...createWithdrawalExpense(service, input),
    amount: String(input.amount),
  };
  assert.equal(isExpenseInScope(expense, { type: "service", id: 9 }), true);
  assert.equal(isExpenseInScope(expense, { type: "service", id: 10 }), false);
  assert.equal(isExpenseInScope(expense, { type: "chalet", submissionId: 7 }), false);
  assert.equal(isExpenseInScope(expense, { type: "all" }), true);
  for (const scope of [
    { type: "service", id: 9 },
    { type: "service", id: 10 },
    { type: "chalet", submissionId: 7 },
    { type: "all" },
  ] as const) {
    const entries = buildBankLedger({ scope, expenses: [expense], bookings: [], payments: [], deposits: [] });
    const expected = scope.type === "all" || (scope.type === "service" && scope.id === 9) ? input.amount : 0;
    assert.equal(entries.length, expected ? 1 : 0);
    assert.deepEqual(bankLedgerTotals(entries), { deposited: 0, withdrawn: expected, balance: expected ? -expected : 0 });
  }
});

test("a withdrawal cannot silently become an unallocated expense", () => {
  assert.throws(() => createWithdrawalExpense({ type: "all" }, input));
  assert.throws(() => createWithdrawalExpense({ type: "chalet", id: 40, name: "عقار" }, input));
});

test("invalid amounts and missing dates do not produce a submission", () => {
  for (const amount of [0, -1, NaN, Infinity]) {
    assert.throws(() => createWithdrawalExpense(service, { ...input, amount }));
  }
  assert.throws(() => createWithdrawalExpense(service, { ...input, dateStr: "" }));
});
