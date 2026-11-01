import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { ServiceBookingFilters } from "./ServiceBookingFilters";

const props = {
  scope: "active" as const,
  payment: "unpaid" as const,
  status: "pending" as const,
  onScopeChange() {},
  onPaymentChange() {},
  onStatusChange() {},
};

it("keeps operational scopes outside the independent archive in one responsive RTL panel", () => {
  const html = renderToStaticMarkup(React.createElement(ServiceBookingFilters, props));
  assert.equal((html.match(/data-testid="service-booking-filters"/g) ?? []).length, 1);
  assert.equal((html.match(/<button/g) ?? []).length, 8);
  assert.ok(!html.includes("أرشيف المكتملة"));
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 3);
  assert.equal((html.match(/role="group"/g) ?? []).length, 3);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /flex-wrap/);
  for (const label of ["نطاق السجل", "حالة الدفع", "حالة الحجز"]) assert.ok(html.includes(label));
});

it("hides the inapplicable confirmation filter for cancelled requests without hiding payment filters", () => {
  const html = renderToStaticMarkup(React.createElement(ServiceBookingFilters, { ...props, scope: "cancelled" }));
  assert.equal((html.match(/<button/g) ?? []).length, 5);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 2);
  assert.ok(!html.includes("حالة الحجز"));
  assert.ok(html.includes("حالة الدفع"));
});

it("forwards clicks to their existing independent handlers, without changing another filter", () => {
  const events: string[] = [];
  const tree = ServiceBookingFilters({
    ...props,
    onScopeChange: value => events.push(`scope:${value}`),
    onPaymentChange: value => events.push(`payment:${value}`),
    onStatusChange: value => events.push(`status:${value}`),
  });
  const buttons: Array<() => void> = [];
  function walk(node: React.ReactNode) {
    if (!React.isValidElement<{ children?: React.ReactNode; onClick?: () => void }>(node)) return;
    if (node.type === "button") buttons.push(node.props.onClick!);
    React.Children.forEach(node.props.children, walk);
  }
  walk(tree);
  assert.deepEqual(events, []);
  buttons[1]();
  buttons[3]();
  buttons[7]();
  assert.deepEqual(events, ["scope:cancelled", "payment:unpaid", "status:pending"]);
});

it("places the unified controls before the service list, preserving state and pagination callbacks", () => {
  const source = readFileSync(new URL("./ServiceCalendarBookingsTab.tsx", import.meta.url), "utf8");
  const code = source.slice(source.indexOf('data-testid="service-bookings-register"'));
  assert.ok(code.indexOf("<ServiceBookingFilters") < code.indexOf("pagedAppts.items.map"));
  assert.ok(code.includes("onScopeChange={scope => { setServiceBookingScope(scope); setServiceListPage(1); }}"));
  assert.ok(code.includes("onPaymentChange={filter => { setServicePaymentFilter(filter); setServiceListPage(1); }}"));
  assert.ok(code.includes("onStatusChange={filter => { setListFilter(filter); setServiceListPage(1); }}"));
  assert.ok(code.indexOf("<ServiceBookingArchive") > code.indexOf("pagedAppts.items.map"));
  assert.ok(code.includes("key={providerId}"));
});
