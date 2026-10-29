import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultExpenseActivity, expenseTarget } from "./expenseTarget";

const service = { type: "service", id: 9, name: "نشاط اختبار" } as const;
const property = { type: "chalet", id: 40, submissionId: 7, name: "عقار اختبار" } as const;

test("sole visible activity is the automatic expense target despite all dashboard scope", () => {
  assert.deepEqual(expenseTarget(defaultExpenseActivity({ type: "all" }, [service])), { providerId: 9 });
  assert.deepEqual(expenseTarget(defaultExpenseActivity({ type: "all" }, [property])), { submissionId: 7 });
});

test("multiple activities allow general expenses without mandatory allocation", () => {
  assert.deepEqual(expenseTarget(defaultExpenseActivity({ type: "all" }, [service, property])), {});
  assert.deepEqual(expenseTarget(defaultExpenseActivity({ type: "all" }, [])), {});
});

test("selected activity remains authoritative and property uses submission identity", () => {
  assert.deepEqual(expenseTarget(defaultExpenseActivity(service, [service, property])), { providerId: 9 });
  assert.deepEqual(expenseTarget(defaultExpenseActivity(property, [service, property])), { submissionId: 7 });
  assert.throws(() => expenseTarget({ type: "chalet", id: 40, name: "عقار" }));
});
