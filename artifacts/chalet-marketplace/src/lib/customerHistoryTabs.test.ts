import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CustomerHistory } from "../components/owner/CustomerHistory";
import { customerHistoryTabs, resolveCustomerHistoryTab } from "./customerHistoryTabs";
import type { ServiceCapabilities } from "./serviceDashboardTabs";

Object.assign(globalThis, { React });
const profile = { totalBookings: 3, contractCount: 2, insuranceCount: 1 };
const ids = (capabilities?: ServiceCapabilities, counts = profile) =>
  customerHistoryTabs(counts, 94, capabilities).map(tab => tab.id);

it("hides both service features when disabled, missing or still loading even with old records", () => {
  for (const capabilities of [undefined, {}, { requiresContract: false, requiresInsurance: false, insuranceAmount: "100" }]) {
    assert.deepEqual(ids(capabilities), ["bookings"]);
  }
});
it("enables contracts and insurance independently and only with nonempty histories", () => {
  assert.deepEqual(ids({ requiresContract: true }), ["bookings", "contracts"]);
  assert.deepEqual(ids({ requiresInsurance: true, insuranceAmount: "100" }), ["bookings", "insurance"]);
  assert.deepEqual(ids({ requiresContract: true, requiresInsurance: true, insuranceAmount: "100" }), ["bookings", "contracts", "insurance"]);
  assert.deepEqual(ids({ requiresContract: true, requiresInsurance: true, insuranceAmount: "100" },
    { ...profile, contractCount: 0, insuranceCount: 0 }), ["bookings"]);
  for (const insuranceAmount of ["0", "", "-1", "NaN", null]) {
    assert.deepEqual(ids({ requiresInsurance: true, insuranceAmount }), ["bookings"]);
  }
});
it("does not inherit another service's settings and resolves a newly hidden active tab to bookings", () => {
  const enabled = customerHistoryTabs(profile, 94, { requiresContract: true });
  const disabled = customerHistoryTabs(profile, 95, { requiresContract: false });
  assert.equal(resolveCustomerHistoryTab("contracts", enabled), "contracts");
  assert.equal(resolveCustomerHistoryTab("contracts", disabled), "bookings");
  assert.equal(resolveCustomerHistoryTab("insurance", disabled), "bookings");
  assert.deepEqual(customerHistoryTabs(profile).map(t => t.id), ["bookings", "contracts", "insurance"]);
  assert.deepEqual(customerHistoryTabs({ ...profile, contractCount: 0, insuranceCount: 0 }).map(t => t.id),
    ["bookings", "contracts", "insurance"]);
});
it("actual customer profile markup omits disabled/empty tabs and shows eligible ones", () => {
  const render = (capabilities: ServiceCapabilities, counts = profile) => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    client.setQueryData(["service-provider-detail", 94], capabilities);
    const html = renderToStaticMarkup(React.createElement(QueryClientProvider, { client },
      React.createElement(CustomerHistory, {
        profile: { ...counts, clientName: "عميل", clientPhone: "0500000000", clientIdNumber: null,
          totalRevenue: 500, lastBookingDate: "2026-10-28", note: "" },
        providerId: 94, calendar: "hijri", onCalendarChange: () => {},
      })));
    client.clear();
    return html;
  };
  const off = render({ requiresContract: false, requiresInsurance: false, insuranceAmount: "100" });
  assert.ok(off.includes("سجل الحجوزات"));
  assert.ok(!off.includes("العقود الرقمية"));
  assert.ok(!off.includes("سجل التأمينات"));
  const on = render({ requiresContract: true, requiresInsurance: true, insuranceAmount: "100" });
  assert.ok(on.includes("العقود الرقمية"));
  assert.ok(on.includes("سجل التأمينات"));
  const empty = render({ requiresContract: true, requiresInsurance: true, insuranceAmount: "100" },
    { ...profile, contractCount: 0, insuranceCount: 0 });
  assert.ok(!empty.includes("العقود الرقمية"));
  assert.ok(!empty.includes("سجل التأمينات"));
});
