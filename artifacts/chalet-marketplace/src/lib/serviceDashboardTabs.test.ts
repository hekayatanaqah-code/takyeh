import assert from "node:assert/strict";
import { it } from "node:test";
import { hasServiceInsurance, serviceDashboardTabs } from "./serviceDashboardTabs";

it("restores the complete service navigation even for all activities", () => {
  const ids = serviceDashboardTabs([], true).map(v => v.id);
  for (const id of ["details", "catalog", "seasons", "offers", "reviews", "calendar", "quickSales", "customers", "messages"] as const) {
    assert.ok(ids.includes(id), id);
  }
});
it("shows quick sales only when the account setting is enabled in individual and all-activity navigation", () => {
  for (const providers of [[], [{ requiresContract: true, requiresInsurance: true, insuranceAmount: "100" }]]) {
    const disabled = serviceDashboardTabs(providers, false);
    const enabled = serviceDashboardTabs(providers, true);
    assert.equal(serviceDashboardTabs(providers).some(tab => tab.id === "quickSales"), false);
    assert.equal(disabled.some(tab => tab.id === "quickSales"), false);
    assert.equal(enabled.filter(tab => tab.id === "quickSales").length, 1);
    assert.deepEqual(enabled.filter(tab => tab.id !== "quickSales"), disabled);
    assert.ok(disabled.some(tab => tab.id === "details"), "settings remain reachable when quick sales is disabled");
  }
});
it("insurance needs enabled insurance and a finite positive amount", () => {
  for (const insuranceAmount of [null, "", "0", "-1", "NaN", "Infinity"]) {
    assert.equal(hasServiceInsurance({ requiresInsurance: true, insuranceAmount }), false);
  }
  assert.equal(hasServiceInsurance({ requiresInsurance: false, insuranceAmount: "100" }), false);
  assert.equal(hasServiceInsurance({ requiresInsurance: true, insuranceAmount: "100.00" }), true);
  assert.ok(serviceDashboardTabs([{ requiresInsurance: true, insuranceAmount: "100" }]).some(t => t.id === "insurance"));
  assert.equal(serviceDashboardTabs([{ requiresInsurance: true, insuranceAmount: "0" }]).some(t => t.id === "insurance"), false);
});
