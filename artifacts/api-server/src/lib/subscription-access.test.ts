import assert from "node:assert/strict";
import { test } from "node:test";
import {
  initialTrialSubscriptionState,
  isOwnerFreeAccessGrantActive,
  latestOwnerFreeAccess,
  latestOwnerFreeAccessForKeys,
} from "./subscription-access";

test("new owners receive a 30-day trial only while the trial plan is enabled", () => {
  const now = new Date("2025-01-01T00:00:00.000Z");
  const enabled = initialTrialSubscriptionState(true, 30, now);
  assert.equal(enabled.status, "active");
  assert.equal(enabled.expiresAt.toISOString(), "2025-01-31T00:00:00.000Z");

  const disabled = initialTrialSubscriptionState(false, 30, now);
  assert.equal(disabled.status, "expired");
  assert.equal(disabled.expiresAt, now);
});

test("the latest free-access grant supersedes an earlier indefinite grant, including by insertion id", () => {
  const createdAt = new Date("2025-01-01T00:00:00.000Z");
  const indefinite = { id: 1, createdAt, expiresAt: null };
  const fixed = { id: 2, createdAt, expiresAt: new Date("2025-01-05T00:00:00.000Z") };
  assert.deepEqual(latestOwnerFreeAccess([indefinite, fixed]), fixed);
});

test("latest expired free-access grant overrides a still-live prior grant", () => {
  const now = new Date("2025-02-01T00:00:00.000Z");
  const latest = latestOwnerFreeAccess([
    { id: 2, createdAt: new Date("2025-01-02T00:00:00.000Z"), expiresAt: new Date("2025-01-03T00:00:00.000Z") },
    { id: 1, createdAt: new Date("2025-01-01T00:00:00.000Z"), expiresAt: null },
  ]);
  assert.equal(latest?.id, 2);
  assert.ok(latest?.expiresAt && latest.expiresAt <= now);
  assert.equal(isOwnerFreeAccessGrantActive(latest, now), false);
});

test("unlimited free-access grants remain active without an expiry", () => {
  assert.equal(isOwnerFreeAccessGrantActive({ expiresAt: null }, new Date()), true);
});

test("owner aliases share one latest-grant timeline", () => {
  const grants = [
    {
      ownerId: "owner_42",
      id: 1,
      createdAt: new Date("2025-01-01T00:00:00.000Z"),
      expiresAt: null,
    },
    {
      ownerId: "account_user_42",
      id: 2,
      createdAt: new Date("2025-01-02T00:00:00.000Z"),
      expiresAt: new Date("2025-01-03T00:00:00.000Z"),
    },
    {
      ownerId: "unrelated",
      id: 3,
      createdAt: new Date("2025-01-03T00:00:00.000Z"),
      expiresAt: null,
    },
  ];
  assert.equal(latestOwnerFreeAccessForKeys(grants, ["account_user_42", "owner_42"])?.id, 2);
});