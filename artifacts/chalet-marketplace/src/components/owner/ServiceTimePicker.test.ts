import assert from "node:assert/strict";
import { it } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { displayTime, formatCanonical, from12, parseTime, ServiceTimePicker, to12 } from "./ServiceTimePicker";

Object.assign(globalThis, { React });
it("round-trips every hour and minute between 12/24-hour formats without changing the saved time", () => {
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m++) {
      const value = formatCanonical(h, m);
      const t = to12(h);
      assert.equal(formatCanonical(from12(t.hour, t.pm), m), value);
      assert.deepEqual(parseTime(value), { h, m });
    }
  }
});
it("rejects impossible, unpadded and noncanonical values", () => {
  for (const value of ["", "24:00", "00:60", "-1:00", "12:-1", "9:30", "12:3", "١٢:٣٠", "12:30:45"])
    assert.equal(parseTime(value), null);
});
it("displays midnight, noon and minute precision correctly in both systems", () => {
  assert.equal(displayTime("00:00", "12"), "١٢:٠٠ ص");
  assert.equal(displayTime("12:00", "12"), "١٢:٠٠ م");
  assert.equal(displayTime("23:59", "12"), "١١:٥٩ م");
  assert.equal(displayTime("00:05", "24"), "٠٠:٠٥");
  assert.equal(displayTime("13:07", "24"), "١٣:٠٧");
  assert.equal(displayTime("", "12"), "");
});
it("shows separate constrained columns and leaves an unsaved blank time blank", () => {
  const html = renderToStaticMarkup(React.createElement(ServiceTimePicker, {
    id: "test-time", value: "", defaultOpen: true,
    onChange: () => { throw new Error("Opening must not commit a time"); },
  }));
  assert(!html.includes('type="time"'));
  assert(html.includes('value=""'));
  assert(html.includes('data-time-value=""'));
  assert(html.includes("list-time-hour-12"));
  assert(!html.includes("list-time-hour-0\""));
  assert(!html.includes("list-time-hour-13"));
  const minutes = [...html.matchAll(/data-testid="list-time-minute-(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(minutes, [0, 15, 30, 45]);
  assert(html.includes("list-time-period"));
  assert(html.includes("button-time-format-24"));
  assert(html.includes("تأكيد الوقت"));
});
it("preserves historical non-quarter-hour values without adding them to the selectable minutes or committing on open", () => {
  const html = renderToStaticMarkup(React.createElement(ServiceTimePicker, {
    id: "historical-time", value: "13:07", defaultOpen: true,
    onChange: () => { throw new Error("Opening must not round or commit a historical time"); },
  }));
  assert(html.includes('data-time-value="13:07"'));
  assert(html.includes('value="13:07"'));
  assert(html.includes("١:٠٧ م"));
  const minutes = [...html.matchAll(/data-testid="list-time-minute-(\d+)"/g)].map(match => Number(match[1]));
  assert.deepEqual(minutes, [0, 15, 30, 45]);
});
it("selects every quarter-hour correctly while keeping noon/midnight conversions unchanged", () => {
  for (const minute of [0, 15, 30, 45]) {
    const value = formatCanonical(12, minute);
    const html = renderToStaticMarkup(React.createElement(ServiceTimePicker, {
      id: `quarter-${minute}`, value, defaultOpen: true, onChange() {},
    }));
    assert.match(html, new RegExp(`aria-selected="true"[^>]*data-testid="list-time-minute-${minute}"`));
    assert.equal(displayTime(value, "12"), `١٢:${String(minute).padStart(2, "0").replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)])} م`);
  }
});
