import assert from "node:assert/strict";
import { test } from "node:test";
import { split24, join24 } from "./timePicker";

test("custom Arabic time picker preserves every minute across midnight and noon", () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      assert.equal(join24(split24(time)), time);
    }
  }
  assert.deepEqual(split24("00:00"), { hour: 12, minute: 0, pm: false });
  assert.deepEqual(split24("12:00"), { hour: 12, minute: 0, pm: true });
  assert.equal(join24({ hour: 9, minute: 5, pm: true }), "21:05");
});
