import assert from "node:assert/strict";
import { it } from "node:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import React, { useMemo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { getHijriMonthDays, toHijriComponents } from "./hijri";
import { propertyCalendarBookingMap, propertyCalendarRows } from "./propertyCalendar";

const bookings = [
  { id: 1, bookingDate: "2026-10-30", period: "morning", clientName: "أحمد الأول" },
  { id: 2, bookingDate: "2026-10-30", period: "morning", clientName: "خالد الثاني" },
  { id: 3, bookingDate: "2026-10-30", period: "full_day", clientName: "سالم الثالث" },
  { id: 4, bookingDate: "2026-10-29", durationDays: 4, period: "evening", clientName: "ناصر الرابع" },
  { id: 5, bookingDate: "2026-10-30", cancelledAt: "2026-10-29", clientName: "ملغي" },
];

it("retains all same-period bookings and expands stays across month and year boundaries", () => {
  const map = propertyCalendarBookingMap(bookings);
  assert.deepEqual(map.get("2026-10-30")?.get("morning")?.map(b => b.id), [1, 2]);
  assert.equal(map.get("2026-11-01")?.get("evening")?.[0].id, 4);
  assert.equal(map.get("2026-11-02"), undefined);
  assert.ok(![...map.values()].flatMap(periods => [...periods.values()].flat()).some(b => b.id === 5));
  const yearEnd = propertyCalendarBookingMap([{ id: 6, bookingDate: "2026-12-31", durationDays: 2 }]);
  assert.equal(yearEnd.get("2027-01-01")?.get("full_day")?.[0].id, 6);
});

it("never lets full-day mirror availability hide real morning or evening bookings", () => {
  const day = propertyCalendarBookingMap(bookings).get("2026-10-30");
  const rows = propertyCalendarRows(day, { periodFullDay: true, periodMorning: true, periodEvening: true, notes: "إغلاق" });
  assert.deepEqual(rows.map(row => row.bookingId), [1, 2, 3, 4]);
  const partial = propertyCalendarRows(new Map([["morning", [bookings[0]]]]), { periodFullDay: true });
  assert.equal(partial[0].bookingId, 1);
  assert.ok(partial.some(row => row.label === "🔒 يوم كامل"));
  assert.deepEqual(propertyCalendarRows(undefined, { notes: "صيانة", periodFullDay: true }), []);
});

it("renders every booking in both actual property calendar components, with a scroll-safe page wrapper", () => {
  const source = readFileSync(new URL("../pages/Dashboard.tsx", import.meta.url), "utf8");
  const calendarCode = source.slice(source.indexOf("function MiniCalendar("), source.indexOf("/* ── Cancellation Management Dialog"));
  const js = ts.transpileModule(calendarCode, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  const deps = { React, useMemo, getHijriMonthDays, toHijriComponents, propertyCalendarBookingMap, propertyCalendarRows };
  const components = new Function(...Object.keys(deps), `${js}; return { MiniCalendar, GregorianMiniCalendar };`)(...Object.values(deps));
  const h = toHijriComponents(new Date(2026, 9, 30));
  for (const [name, component, props] of [
    ["hijri", components.MiniCalendar, { hijriYear: h.year, hijriMonth: h.month }],
    ["gregorian", components.GregorianMiniCalendar, { gregYear: 2026, gregMonth: 10 }],
  ] as const) {
    const html = renderToStaticMarkup(React.createElement(component, { ...props, availability: [{ dateStr: "2026-10-30", periodFullDay: true }], bookings, onDateClick() {} }));
    const targetCell = html.match(/<button[^>]*data-property-calendar-date="2026-10-30"[\s\S]*?<\/button>/)?.[0] ?? "";
    for (const id of [1, 2, 3, 4]) assert.ok(targetCell.includes(`data-calendar-booking-id="${id}"`), `${name}: missing booking ${id}`);
    assert.ok(!html.includes('data-calendar-booking-id="5"'));
    if (process.env.CALENDAR_LAYOUT_DIR) {
      mkdirSync(process.env.CALENDAR_LAYOUT_DIR, { recursive: true });
      const css = process.env.CALENDAR_CSS ? readFileSync(process.env.CALENDAR_CSS, "utf8") : "";
      writeFileSync(`${process.env.CALENDAR_LAYOUT_DIR}/${name}.html`, `<!doctype html><html dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"><main class="mx-auto max-w-6xl p-4"><div class="property-booking-management space-y-6"><h1 class="text-xl font-bold">تقويم الحجوزات — بيانات اختبارية</h1>${html}<section class="rounded-2xl border p-5" style="min-height:650px"><h2>تفاصيل الحجوزات — عينة اختبار للتمرير</h2></section><section data-testid="booking-archive" class="rounded-2xl border p-5"><h2>الأرشيف</h2><button data-testid="last-action" class="mt-4 rounded-xl border px-4 py-2">آخر إجراء</button></section></div></main></div></body></html>`);
    }
  }
  assert.ok(source.includes('className="property-booking-management space-y-6"'));
  assert.ok(source.includes('refetchOnMount: "always"'));
  assert.ok(source.includes("const sumBkgs = calBookings.filter"));
  const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
  assert.ok(css.includes("padding-bottom: calc(5rem + env(safe-area-inset-bottom, 0px))"));
});
