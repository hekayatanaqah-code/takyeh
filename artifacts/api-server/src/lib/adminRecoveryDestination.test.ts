import assert from "node:assert/strict";
import { test } from "node:test";
import { adminRecoveryDestination } from "./adminRecoveryDestination";

test("personal admin email takes priority and is normalized", () => {
  assert.equal(adminRecoveryDestination({ email: " Admin@Example.test ", is_super_admin: true }), "admin@example.test");
});
test("neither superadmin nor delegated staff may use a fallback when personal email is absent", () => {
  assert.equal(adminRecoveryDestination({ email: null, is_super_admin: true }), null);
  assert.equal(adminRecoveryDestination({ email: "", is_super_admin: false }), null);
  assert.equal(adminRecoveryDestination({ email: "  ", is_super_admin: true }), null);
});
test("each staff member gets only their own saved valid destination", () => {
  assert.equal(adminRecoveryDestination({ email: "not-an-email", is_super_admin: true }), null);
  assert.equal(adminRecoveryDestination({ email: " employee1@example.test ", is_super_admin: false }), "employee1@example.test");
  assert.equal(adminRecoveryDestination({ email: "employee2@example.test", is_super_admin: false }), "employee2@example.test");
});
