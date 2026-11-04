import assert from "node:assert/strict";
import { test } from "node:test";
import { adminRecoveryDestination } from "./adminRecoveryDestination";

test("personal admin email takes priority and is normalized", () => {
  assert.equal(adminRecoveryDestination({ email: " Admin@Example.test ", is_super_admin: true }, "fallback@example.test"), "admin@example.test");
});
test("only the superadmin without a stored email may use the configured fallback", () => {
  assert.equal(adminRecoveryDestination({ email: null, is_super_admin: true }, "emergency@example.test"), "emergency@example.test");
  assert.equal(adminRecoveryDestination({ email: "", is_super_admin: false }, "emergency@example.test"), null);
  assert.equal(adminRecoveryDestination({ email: null, is_super_admin: true }, undefined), null);
});
test("invalid stored email does not silently redirect recovery; invalid fallback is rejected", () => {
  assert.equal(adminRecoveryDestination({ email: "not-an-email", is_super_admin: true }, "emergency@example.test"), null);
  assert.equal(adminRecoveryDestination({ email: null, is_super_admin: true }, "invalid"), null);
});
