import assert from "node:assert/strict";
import { test } from "node:test";
import { initialTrialSubscriptionState } from "./subscription-access";

test("new owners receive a 30-day trial only while the trial plan is enabled", () => {
  const now = new Date("2025-01-01T00:00:00.000Z");
  const enabled = initialTrialSubscriptionState(true, 30, now);
  assert.equal(enabled.status, "active");
  assert.equal(enabled.expiresAt.toISOString(), "2025-01-31T00:00:00.000Z");

  const disabled = initialTrialSubscriptionState(false, 30, now);
  assert.equal(disabled.status, "expired");
  assert.equal(disabled.expiresAt, now);
});