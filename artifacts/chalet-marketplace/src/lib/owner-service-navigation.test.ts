import assert from "node:assert/strict";
import { test } from "node:test";
import { hasApprovedActiveProperty, hasOwnerActivities, initialOwnerDashboardMode, selectOwnerService } from "./owner-service-navigation";

const services = [
  { id: 1, isActive: false },
  { id: 2, isActive: true },
  { id: 3, isActive: true },
];

test("advanced property management requires a matching approved, active property", () => {
  const property = { submissionId: 1, isActive: true };
  assert.equal(hasApprovedActiveProperty(), false);
  for (const status of ["pending", "rejected", "needs_revision", "cancelled"]) {
    assert.equal(hasApprovedActiveProperty([{ id: 1, status }], [property]), false, status);
  }
  assert.equal(hasApprovedActiveProperty([{ id: 1, status: "approved" }], []), false);
  assert.equal(hasApprovedActiveProperty([{ id: 1, status: "approved" }], [{ ...property, isActive: false }]), false);
  assert.equal(hasApprovedActiveProperty([{ id: 2, status: "approved" }], [property]), false);
  assert.equal(hasApprovedActiveProperty([{ id: 1, status: "approved" }], [property]), true);
});

test("one eligible property enables management in a mixed list; losing eligibility hides it again", () => {
  const submissions = [{ id: 1, status: "rejected" }, { id: 2, status: "approved" }];
  const properties = [{ submissionId: 1, isActive: true }, { submissionId: 2, isActive: true }];
  assert.equal(hasApprovedActiveProperty(submissions, properties), true);
  assert.equal(hasApprovedActiveProperty(submissions, properties.map(item => ({ ...item, isActive: false }))), false);
  assert.equal(hasApprovedActiveProperty(submissions.map(item => ({ ...item, status: "needs_revision" })), properties), false);
});

test("the onboarding empty state requires no properties, services or submissions", () => {
  assert.equal(hasOwnerActivities(0, 0, 0, 0), false);
  assert.equal(hasOwnerActivities(1, 0, 0, 0), true);
  assert.equal(hasOwnerActivities(0, 0, 1, 0), true);
  assert.equal(hasOwnerActivities(0, 1, 0, 0), true);
  assert.equal(hasOwnerActivities(0, 0, 0, 1), true);
});

test("direct entry prefers the first active service over an earlier inactive service", () => {
  assert.equal(selectOwnerService(services, null), 2);
});

test("a valid explicit service selection stays selected, even if inactive", () => {
  assert.equal(selectOwnerService(services, 3), 3);
  assert.equal(selectOwnerService(services, 1), 1);
});

test("an unavailable default selection recovers to an active owned service", () => {
  assert.equal(selectOwnerService(services, 99), 2);
});

test("accounts without active services may still manage an inactive service", () => {
  assert.equal(selectOwnerService([{ id: 1, isActive: false }], null), 1);
  assert.equal(selectOwnerService([], null), null);
});

test("service and mixed accounts with services enter service management without a hub", () => {
  assert.equal(initialOwnerDashboardMode("service", 2, 0), "services");
  assert.equal(initialOwnerDashboardMode("both", 2, 0), "services");
});

test("pending-only service accounts enter registration requests rather than property management", () => {
  assert.equal(initialOwnerDashboardMode("service", 0, 0), "services");
  assert.equal(initialOwnerDashboardMode("both", 0, 1), "services");
});

test("property-only accounts and mixed accounts without services keep property management", () => {
  assert.equal(initialOwnerDashboardMode("chalet", 0, 0), "chalets");
  assert.equal(initialOwnerDashboardMode("both", 0, 0), "chalets");
});

test("service inventory errors do not silently send mixed accounts to property management", () => {
  assert.equal(initialOwnerDashboardMode("both", 0, 0, true), "services");
});