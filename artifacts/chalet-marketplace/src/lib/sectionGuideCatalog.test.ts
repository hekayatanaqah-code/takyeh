import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { SECTION_GUIDE_GROUPS, SERVICE_TAB_GUIDE_KEYS, sectionGuideKey, resolveGuideActivity, sectionGuidesFor } from "./sectionGuideCatalog";
import { serviceDashboardTabs } from "./serviceDashboardTabs";
import { SectionGuideCatalogView } from "../components/admin/SectionGuideCatalogView";

const entries = (index: number) => {
  const group = SECTION_GUIDE_GROUPS[index];
  return [...group.sections, group.financeOverview, ...group.financeSections];
};
const keys = (index: number) => entries(index).map(section => section.key);
const legacy = ["dashboard", "chalets", "seasons", "reviews", "calendar", "deposits", "customers", "services", "messageSettings", "digitalContracts", "revenues", "ledger", "expenses", "employees", "notifications", "reports", "support", "transactions"];

test("preserves every existing guide key and gives services a disjoint independent catalog", () => {
  assert.ok(legacy.every(key => keys(0).includes(key)));
  const all = [...keys(0), ...keys(1)];
  assert.equal(new Set(all).size, all.length);
  assert.ok(keys(1).every(key => key.startsWith("service_")));
  assert.equal(sectionGuideKey("service_reports", "service"), "service_reports");
  assert.equal(sectionGuideKey("ledger", "property"), "ledger");
});

test("gives both activities their own finance overview and all four required financial children", () => {
  for (const group of SECTION_GUIDE_GROUPS) {
    for (const key of ["revenues", "expenses", "ledger", "reports"]) {
      assert.ok(group.financeSections.some(section => section.key === sectionGuideKey(key, group.activity)));
      assert.ok(!group.sections.some(section => section.key === sectionGuideKey(key, group.activity)));
    }
    assert.equal(group.financeOverview.key, sectionGuideKey("adminFinance", group.activity));
    assert.ok(group.financeTitle.includes(group.activity === "service" ? "للخدمات" : "للعقارات"));
  }
});

test("covers every service operational tab, including optional sales, insurance and contracts", () => {
  const tabs = serviceDashboardTabs([{ requiresInsurance: true, insuranceAmount: "100", requiresContract: true }], true);
  for (const tab of tabs) {
    assert.ok(SERVICE_TAB_GUIDE_KEYS[tab.id], tab.id);
    assert.ok(keys(1).includes(sectionGuideKey(SERVICE_TAB_GUIDE_KEYS[tab.id], "service")), tab.id);
  }
});

test("a selected service never falls back to property videos, even inside a mixed owner", () => {
  assert.equal(resolveGuideActivity({ context: "property", providerId: 7 }), "service");
  assert.equal(resolveGuideActivity({ financeType: "service" }), "service");
  assert.equal(resolveGuideActivity({ context: "property", financeType: "service" }), "service");
  assert.equal(resolveGuideActivity({ context: "service", financeType: "chalet" }), "property");
  assert.equal(resolveGuideActivity({ context: "service", financeType: "all" }), "service");
  const legacy = [{ id: 1, section_key: "revenues", title: "عقارات" }];
  assert.deepEqual(sectionGuidesFor(legacy, sectionGuideKey("revenues", "service")), []);
  const videos = [...legacy, { id: 2, section_key: "service_revenues", title: "خدمات" }];
  assert.deepEqual(sectionGuidesFor(videos, sectionGuideKey("revenues", "service")).map(row => row.id), [2]);
  assert.deepEqual(sectionGuidesFor(videos, sectionGuideKey("revenues", "property")).map(row => row.id), [1]);
});

test("mixed consolidated finance exposes separate property and service guide buttons", () => {
  assert.equal(resolveGuideActivity({ context: "both", financeType: "all" }), "both");
  const source = readFileSync(new URL("../components/owner/SectionGuideButton.tsx", import.meta.url), "utf8");
  assert.ok(source.includes('label="شروحات العقارات"'));
  assert.ok(source.includes('label="شروحات الخدمات"'));
  assert.ok(source.includes('sectionGuideKey(sectionKey, "property")'));
  assert.ok(source.includes('sectionGuideKey(sectionKey, "service")'));
  assert.ok(source.includes("key={key}"));
  assert.ok(source.includes("sectionGuidesFor(guides, sectionKey)"));
});

test("the admin view retains both independently keyed groups and financial subgroups", () => {
  const rendered: string[] = [];
  const html = renderToStaticMarkup(React.createElement(SectionGuideCatalogView, {
    renderSection: section => {
      rendered.push(section.key);
      return React.createElement("p", { "data-section": section.key }, section.label);
    },
  }));
  assert.equal(new Set(rendered).size, keys(0).length + keys(1).length);
  assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
  assert.equal((html.match(/role="tabpanel"/g) ?? []).length, 2);
  for (const label of ["شروحات العقارات", "شروحات الخدمات", "الشؤون الإدارية والمالية (للعقارات)", "الشؤون الإدارية والمالية (للخدمات)"]) assert.ok(html.includes(label));
});
