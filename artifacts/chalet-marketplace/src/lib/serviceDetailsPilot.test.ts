import assert from "node:assert/strict";
import { it } from "node:test";
import { isServiceDetailsPilot } from "./serviceDetailsPilot";

it("enables the activity-details pilot only for the explicitly selected provider", () => {
  assert.equal(isServiceDetailsPilot(282), true);
  for (const id of [281, 283, 0, -1, Number.NaN, null, undefined]) {
    assert.equal(isServiceDetailsPilot(id), false);
  }
});
