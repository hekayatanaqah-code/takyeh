import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DashboardActivitySelector } from "./DashboardActivitySelector";

// The Node/tsx test runner uses classic JSX; Vite supplies the JSX runtime in the app.
Object.assign(globalThis, { React });

type Props = React.ComponentProps<typeof DashboardActivitySelector>;
const property = { id: 1, nameAr: "الياسمين" };
const service = { id: 1, businessName: "خدمة الورد" };
function render(properties: Props["properties"], services: Props["services"]) {
  return renderToStaticMarkup(React.createElement(DashboardActivitySelector, {
    value: { type: "all" }, properties, services,
    onChange: () => { throw new Error("Rendering must not change the selected activity"); },
  }));
}

it("shows one property as static text without a dropdown, arrow or all option", () => {
  const html = render([property], []);
  assert(html.includes("الياسمين"));
  assert(html.includes("dashboard-single-activity"));
  assert(!html.includes("combobox"));
  assert(!html.includes("chevron-down"));
  assert(!html.includes("جميع الأنشطة"));
});

it("shows one service as static text without a dropdown or all option", () => {
  const html = render([], [service]);
  assert(html.includes("خدمة الورد"));
  assert(html.includes("dashboard-single-activity"));
  assert(!html.includes("combobox"));
  assert(!html.includes("chevron-down"));
  assert(!html.includes("جميع الأنشطة"));
});

it("enables the dropdown for multiple properties, services, or mixed activities", () => {
  const cases: [Props["properties"], Props["services"]][] = [
    [[property, { id: 2, nameAr: "النخيل" }], []],
    [[], [service, { id: 2, businessName: "التصوير" }]],
    [[property], [service]],
  ];
  for (const [properties, services] of cases) {
    const html = render(properties, services);
    assert(html.includes("combobox"));
    assert(!html.includes("dashboard-single-activity"));
  }
});

it("does not render an empty activity selector", () => {
  assert.equal(render([], []), "");
});
