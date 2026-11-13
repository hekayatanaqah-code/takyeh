import { test } from "node:test";
import assert from "node:assert/strict";
import { hasCompletedOwnerVerification } from "./owner-verification";

const verified = {
  email_verified: true,
  phone_verified: true,
  phone_verified_at: new Date(),
  deleted_at: null,
};

test("a completed phone verification is required, not just a verified email", () => {
  assert.equal(hasCompletedOwnerVerification({ ...verified, phone_verified: false }), false);
  assert.equal(hasCompletedOwnerVerification({ email_verified: true }), false);
  assert.equal(hasCompletedOwnerVerification(undefined), false);
});

test("flags alone without a persisted verification timestamp cannot authorize an owner", () => {
  assert.equal(hasCompletedOwnerVerification({ ...verified, phone_verified_at: null }), false);
  assert.equal(hasCompletedOwnerVerification({ ...verified, phone_verified_at: undefined }), false);
});

test("email verification and a live account are still required", () => {
  assert.equal(hasCompletedOwnerVerification({ ...verified, email_verified: false }), false);
  assert.equal(hasCompletedOwnerVerification({ ...verified, deleted_at: new Date() }), false);
});

test("completed verification allows the normal password login without requiring a new OTP each time", () => {
  assert.equal(hasCompletedOwnerVerification(verified), true);
});
