import assert from "node:assert/strict";
import { test, after } from "node:test";
import { pool } from "@workspace/db";
import { supportsPackage } from "./photography-qualifications";
import { photographyPolicySchema } from "./photography-policy-settings";
import { qualityEligible, rotationWeight } from "./photography-allocation-policy";
import { sessionDeliverySchema, sessionUploadSchema } from "./photography-session-files";

after(() => pool.end());
test("allocation requires explicit package approval, compatible type and specialty", () => {
  const p = { approvedPackageIds: [7], approvedSpecialties: ["interior"] };
  const pkg = { id: 7, propertyTypes: ["property:chalet"], specialties: ["interior"] };
  assert.equal(supportsPackage(p, pkg, "property:chalet"), true);
  assert.equal(supportsPackage({ ...p, approvedPackageIds: [] }, pkg, "property:chalet"), false);
  assert.equal(supportsPackage(p, pkg, "service:cleaning"), false);
  assert.equal(supportsPackage({ ...p, approvedSpecialties: ["drone"] }, pkg, "property:chalet"), false);
});
test("configured policy controls introduction, declines and exact rating boundary", () => {
  const policy = photographyPolicySchema.parse({ introBookings: 5, cancellationThreshold: 4, cancellationWindowDays: 45, qualityThreshold: 4 });
  assert.equal(rotationWeight(4, 3, policy), 4);
  assert.equal(rotationWeight(5, 3, policy), 2);
  assert.equal(rotationWeight(0, 4, policy), 1);
  assert.equal(qualityEligible({ status: "approved", ratingSum: 8, ratingCount: 2 }, policy), true);
  assert.equal(qualityEligible({ status: "approved", ratingSum: 7, ratingCount: 2 }, policy), false);
  assert.equal(photographyPolicySchema.safeParse({ ...policy, qualityThreshold: 5.1 }).success, false);
});
test("delivery rejects empty bodies, unsafe links and unsupported or oversized files", () => {
  assert.equal(sessionDeliverySchema.safeParse({}).success, false);
  for (const url of ["javascript:alert(1)", "http://example.com/file.zip", "https://localhost/file.zip", "https://user:pass@example.com/file.zip"]) {
    assert.equal(sessionDeliverySchema.safeParse({ deliveryUrl: url }).success, false);
  }
  assert.equal(sessionDeliverySchema.safeParse({ deliveryUrl: "https://example.com/file.zip" }).success, true);
  assert.equal(sessionUploadSchema.safeParse({ name: "photo.jpg", size: 200, contentType: "image/jpeg" }).success, true);
  assert.equal(sessionUploadSchema.safeParse({ name: "file.html", size: 200, contentType: "text/html" }).success, false);
  assert.equal(sessionUploadSchema.safeParse({ name: "archive.zip", size: 104857601, contentType: "application/zip" }).success, false);
});
