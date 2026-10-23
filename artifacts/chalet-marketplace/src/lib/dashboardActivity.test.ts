import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityKey, financialManagementAllowed, notificationInActivity, type DashboardActivity } from "./dashboardActivity";

describe("shared dashboard activity and subscription boundary", () => {
  it("fails closed while access is unavailable, inactive or property-only", () => {
    for (const access of [undefined, null, {}, { active: true, scope: "property" as const }, { active: false, scope: "full" as const }])
      assert.equal(financialManagementAllowed(access), false);
    assert.equal(financialManagementAllowed({ active: true, scope: "full" }), true);
    assert.equal(financialManagementAllowed({ freeAccess: { active: true } }), true);
    assert.equal(financialManagementAllowed(undefined, true), true);
  });
  it("keeps colliding property and service IDs separate, excluding account-wide notices from individual activity views", () => {
    const property: DashboardActivity = { type: "chalet", id: 17, submissionId: 51, name: "عقار" };
    const service: DashboardActivity = { type: "service", id: 17, name: "خدمة" };
    assert.notEqual(activityKey(property), activityKey(service));
    assert(notificationInActivity({ chaletId: 17 }, property));
    assert(notificationInActivity({ submissionId: 51 }, property));
    assert(!notificationInActivity({ chaletId: 18, submissionId: 52 }, property));
    assert(!notificationInActivity({ providerId: 17 }, property));
    assert(!notificationInActivity({ chaletId: 17 }, service));
    assert(notificationInActivity({ providerId: 17 }, service));
    assert(!notificationInActivity({}, property));
    assert(!notificationInActivity({}, service));
    assert(notificationInActivity({}, { type: "all" }));
  });
});
