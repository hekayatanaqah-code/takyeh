import assert from "node:assert/strict";
import { test } from "node:test";
import { holdingGroup, holdingGroupTotals } from "./staffHoldingGroups";

test("legacy kinds map into two groups without rewriting historical records", () => {
  assert.equal(holdingGroup("custody"), "custody");
  assert.equal(holdingGroup("emergency"), "custody");
  assert.equal(holdingGroup("withheld"), "withheld");
  assert.equal(holdingGroup("deposit"), "withheld");
});

test("grouped totals include open legacy records, exclude settled records and never net custody directions", () => {
  const records = [
    { kind: "custody", status: "open", amount: "100.10" },
    { kind: "emergency", status: "open", amount: "25.20" },
    { kind: "withheld", status: "open", amount: "40.05" },
    { kind: "deposit", status: "open", amount: "60.25" },
    { kind: "custody", status: "settled", amount: "9999" },
    { kind: "deposit", status: "settled", amount: "8888" },
  ] as const;
  const before = JSON.stringify(records);
  assert.deepEqual(holdingGroupTotals(records), {
    custody: { open: 125.30, count: 2 },
    withheld: { open: 100.30, count: 2 },
  });
  assert.equal(JSON.stringify(records), before);
  assert.deepEqual(holdingGroupTotals([]), {
    custody: { open: 0, count: 0 }, withheld: { open: 0, count: 0 },
  });
});
