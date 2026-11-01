import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { QuickSalesHistoryStatusFilters } from "./QuickSalesHistoryFilters";

test("shows all three statuses in RTL with one accessible active selection", () => {
  const html = renderToStaticMarkup(React.createElement(QuickSalesHistoryStatusFilters, { value: "all", onChange() {} }));
  assert.equal((html.match(/<button/g) ?? []).length, 3);
  assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1);
  assert.match(html, /dir="rtl"/);
  for (const label of ["الكل", "المكتملة", "الملغاة"]) assert.ok(html.includes(label));
});

test("each button selects its own real sale status without mutating sales", () => {
  const changes: string[] = [];
  const tree = QuickSalesHistoryStatusFilters({ value: "completed", onChange: value => changes.push(value) });
  const children = tree.props.children;
  for (const button of children) button.props.onClick();
  assert.deepEqual(changes, ["all", "completed", "cancelled"]);
});

test("integrates status with the existing date filter and limits the actual phone input", () => {
  const source = readFileSync(new URL("./QuickSalesPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /historyStatus === "all" \|\| s.status === historyStatus/);
  assert.match(source, /isInRevenuePeriod\(s.dateStr, period\)/);
  assert.match(source, /id="qs-phone" type="tel"[^>]+maxLength=\{10\}/);
  assert.match(source, /const next = quickSalePhoneInput\(e.target.value\)/);
  assert.ok(source.indexOf("<QuickSalesHistoryStatusFilters") > source.indexOf("سجل البيع السريع"));
});
