import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServiceBookingScheduleFields, type ServiceBookingScheduleFieldsProps } from "./ServiceBookingScheduleFields";

Object.assign(globalThis, { React });
const unexpectedChange = () => { throw new Error("Rendering must not change booking values"); };
function props(overrides: Partial<ServiceBookingScheduleFieldsProps> = {}): ServiceBookingScheduleFieldsProps {
  return {
    editing: false, time: "", reasonType: "", reason: "",
    onTimeChange: unexpectedChange, onReasonTypeChange: unexpectedChange, onReasonChange: unexpectedChange,
    children: React.createElement("span", null, "التاريخ المحفوظ"),
    ...overrides,
  };
}
function render(overrides: Partial<ServiceBookingScheduleFieldsProps> = {}) {
  return renderToStaticMarkup(React.createElement(ServiceBookingScheduleFields, props(overrides)));
}
it("always displays the same minute-precision time field in creation and editing", () => {
  for (const editing of [false, true]) {
    const html = render({ editing, time: "13:45" });
    assert.equal((html.match(/type="time"/g) ?? []).length, 1);
    assert(html.includes('value="13:45"'));
    assert(html.includes('step="60"'));
    assert(html.includes(">الوقت</label>"));
    assert(html.includes("بتوقيت السعودية"));
    assert(html.includes("١:٤٥ م"));
    assert(html.includes("التاريخ المحفوظ"));
  }
});
it("does not invent a time for a new or historical booking", () => {
  for (const editing of [false, true]) {
    const html = render({ editing });
    assert(html.includes('value=""'));
    assert(!html.includes('value="00:00"'));
    assert(html.includes("اختياري"));
  }
});
it("keeps the required edit reason in the same scheduling section, only during editing", () => {
  assert(!render().includes("اختر سبب التعديل"));
  const html = render({ editing: true, reasonType: "أخرى", reason: "تغيير وقت توصيل الكيك" });
  assert(html.includes("سبب التعديل / إعادة الجدولة"));
  assert(html.includes("تغيير وقت توصيل الكيك"));
  assert(html.includes("اكتب سبب التعديل"));
  assert.equal((html.match(/<fieldset/g) ?? []).length, 1);
});
it("uses unique associated time labels when multiple booking forms are mounted", () => {
  const html = renderToStaticMarkup(React.createElement("div", null,
    React.createElement(ServiceBookingScheduleFields, props()),
    React.createElement(ServiceBookingScheduleFields, props({ editing: true })),
  ));
  const inputIds = [...html.matchAll(/<input[^>]*\sid="([^"]+-time)"/g)].map(match => match[1]);
  assert.equal(inputIds.length, 2);
  assert.equal(new Set(inputIds).size, 2);
  for (const id of inputIds) assert(html.includes(`for="${id}"`));
});
it("preserves midnight, noon and minute precision without timezone conversion", () => {
  for (const [time, arabic] of [
    ["00:00", "١٢ ص"], ["12:00", "١٢ م"], ["23:59", "١١:٥٩ م"], ["09:05", "٩:٠٥ ص"],
  ]) {
    const html = render({ editing: true, time });
    assert(html.includes(`value="${time}"`));
    assert(html.includes(arabic));
  }
});
it("keeps every service booking entry on one form with no standalone reschedule action", () => {
  const source = readFileSync(new URL("../../pages/Dashboard.tsx", import.meta.url), "utf8");
  const service = source.slice(source.indexOf("function ServiceCalendarBookingsTab()"), source.indexOf("/* ── Service Booking Insurance Tab"));
  assert(!service.includes("service-reschedule-"));
  assert(!service.includes("service-list-reschedule-"));
  assert(!service.includes(">تعديل الموعد"));
  assert.equal((service.match(/<ServiceBookingScheduleFields /g) ?? []).length, 1);
  assert(service.includes("startTime: appointment.startTime"));
  assert(service.includes("startTime: form.startTime || null"));
});
