import assert from "node:assert/strict";
import { test } from "node:test";
import { cashBreakdownTotal } from "./revenueLiquidity";

test("outstanding cash matches its records regardless of monthly collections or bank balances", () => {
  assert.equal(cashBreakdownTotal([{ amount: 500 }, { amount: 350 }]), 850);
});

test("empty records and deposited records removed from the list update the total", () => {
  assert.equal(cashBreakdownTotal([]), 0);
  assert.equal(cashBreakdownTotal([{ amount: 350 }]), 350);
});

test("cash totals retain halalas without floating-point accumulation", () => {
  assert.equal(cashBreakdownTotal([{ amount: 0.1 }, { amount: 0.2 }, { amount: 849.7 }]), 850);
  assert.equal(cashBreakdownTotal([{ amount: 125.5 }, { amount: 350.25 }]), 475.75);
});
