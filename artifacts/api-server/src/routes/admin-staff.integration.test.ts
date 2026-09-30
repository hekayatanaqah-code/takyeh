import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import { db, pool, sessionsTable, ownerSupportRequestsTable } from "@workspace/db";

let server: Server;
let baseUrl: string;
let sessionId: string;
let staffId: number | null = null;
let supportRequestId: number | null = null;
const originalAdminUserId = process.env.ADMIN_USER_ID;
const testAdminId = `staff-management-admin-${randomUUID()}`;
const username = `staff_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
const password = `Test-${randomUUID()}`;
const adminHeaders = () => ({ authorization: `Bearer ${sessionId}`, "content-type": "application/json" });

before(async () => {
  process.env.ADMIN_USER_ID = testAdminId;
  sessionId = await createSession({
    user: { id: testAdminId, email: null, firstName: null, lastName: null, profileImageUrl: null },
    access_token: "integration-test",
  });
  server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (supportRequestId) {
    await db.delete(ownerSupportRequestsTable).where(eq(ownerSupportRequestsTable.id, supportRequestId));
  }
  if (staffId) {
    await fetch(`${baseUrl}/api/admin/staff/${staffId}`, { method: "DELETE", headers: adminHeaders() });
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
  if (originalAdminUserId === undefined) delete process.env.ADMIN_USER_ID;
  else process.env.ADMIN_USER_ID = originalAdminUserId;
});

describe("admin staff account and permissions", () => {
  it("validates contact information and stores an initially inactive account without exposing its password", async () => {
    const invalid = await fetch(`${baseUrl}/api/admin/staff`, {
      method: "POST", headers: adminHeaders(),
      body: JSON.stringify({ name: "اختبار", username, password, personalEmail: "not-an-email", isActive: true, permissions: {} }),
    });
    assert.equal(invalid.status, 400);

    const response = await fetch(`${baseUrl}/api/admin/staff`, {
      method: "POST", headers: adminHeaders(),
      body: JSON.stringify({
        name: "موظف اختبار", username, personalEmail: `${username}@example.test`,
        mobile: "0501234567", password, isActive: false, permissions: {},
      }),
    });
    assert.equal(response.status, 201);
    const member = await response.json() as {
      id: number; isActive: boolean; personalEmail: string; mobile: string; passwordHash?: string;
    };
    staffId = member.id;
    assert.equal(member.isActive, false);
    assert.equal(member.personalEmail, `${username}@example.test`);
    assert.equal(member.mobile, "0501234567");
    assert.equal("passwordHash" in member, false);

    const disabledLogin = await fetch(`${baseUrl}/api/admin-staff/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(disabledLogin.status, 403);
  });

  it("activates without OTP, updates profile fields and enforces individual permissions", async () => {
    assert(staffId);
    const status = await fetch(`${baseUrl}/api/admin/staff/${staffId}/status`, {
      method: "PUT", headers: adminHeaders(), body: JSON.stringify({ isActive: true }),
    });
    assert.equal(status.status, 200);

    const login = await fetch(`${baseUrl}/api/admin-staff/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0];
    assert(cookie);
    assert.equal((await fetch(`${baseUrl}/api/admin/plans`, { headers: { cookie } })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/admin/service-regions`, { headers: { cookie } })).status, 403);

    const permissions = await fetch(`${baseUrl}/api/admin/staff/${staffId}/permissions`, {
      method: "PUT", headers: adminHeaders(),
      body: JSON.stringify({ permissions: { serviceCatalog: true, financeSettings: false } }),
    });
    assert.equal(permissions.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/service-regions`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/services`, { headers: { cookie } })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/admin/plans`, { headers: { cookie } })).status, 403);

    const listings = await fetch(`${baseUrl}/api/admin/staff/${staffId}/permissions`, {
      method: "PUT", headers: adminHeaders(),
      body: JSON.stringify({ permissions: { serviceListings: true } }),
    });
    assert.equal(listings.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/service-providers`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/service-submissions`, { headers: { cookie } })).status, 403);

    const support = await fetch(`${baseUrl}/api/admin/staff/${staffId}/permissions`, {
      method: "PUT", headers: adminHeaders(),
      body: JSON.stringify({ permissions: { supportDisputes: true } }),
    });
    assert.equal(support.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/review-chalets`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/chalets`, { headers: { cookie } })).status, 403);

    // A statistics grant and finance-settings grant must not expose the
    // platform budget or any revenue totals through the analytics endpoint.
    const financialGrants = await fetch(`${baseUrl}/api/admin/staff/${staffId}/permissions`, {
      method: "PUT", headers: adminHeaders(),
      body: JSON.stringify({ permissions: { globalFinancials: true, financeSettings: true, supportDisputes: true } }),
    });
    assert.equal(financialGrants.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/plans`, { headers: { cookie } })).status, 200);
    const staffAnalytics = await fetch(`${baseUrl}/api/admin/analytics`, { headers: { cookie } });
    assert.equal(staffAnalytics.status, 200);
    const staffStats = await staffAnalytics.json() as Record<string, unknown>;
    assert("marketDistribution" in staffStats);
    for (const key of ["monthlyRevenue", "weeklyBookings", "monthlyBookings", "weeklyBookingRevenue", "monthlyBookingRevenue", "bookingTimeSeries", "weeklyPerformance", "monthlyPerformance"]) {
      assert.equal(key in staffStats, false, `${key} must not be sent to staff`);
    }
    assert.equal((await fetch(`${baseUrl}/api/admin/platform-revenue`, { headers: { cookie } })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/admin/platform-expenses`, {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ dateStr: "2026-01-01", category: "test", amount: 1 }),
    })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/admin/platform-expenses/1`, { method: "DELETE", headers: { cookie } })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/admin/staff`, { headers: { cookie } })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/admin/staff/${staffId}/permissions`, {
      method: "PUT", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ permissions: { globalFinancials: true } }),
    })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/admin/staff`, {
      method: "POST", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ name: "unauthorized", username: "unauthorized" }),
    })).status, 403);

    const update = await fetch(`${baseUrl}/api/admin/staff/${staffId}/credentials`, {
      method: "PUT", headers: adminHeaders(),
      body: JSON.stringify({ name: "الاسم المحدّث", personalEmail: `changed-${username}@example.test`, mobile: "0507654321" }),
    });
    assert.equal(update.status, 200);
    const list = await fetch(`${baseUrl}/api/admin/staff`, { headers: adminHeaders() });
    const members = await list.json() as Array<{ id: number; name: string; personalEmail: string; mobile: string }>;
    const member = members.find((item) => item.id === staffId);
    assert.equal(member?.name, "الاسم المحدّث");
    assert.equal(member?.personalEmail, `changed-${username}@example.test`);
    assert.equal(member?.mobile, "0507654321");

    // A real support reply and status change both retain the DB-backed
    // employee name in the shared audit trail.
    const [supportRequest] = await db.insert(ownerSupportRequestsTable).values({
      ownerId: `audit-test-${randomUUID()}`,
      subject: "طلب اختبار التدقيق",
      message: "استفسار اختبار",
    }).returning({ id: ownerSupportRequestsTable.id });
    supportRequestId = supportRequest.id;
    const replyForm = new FormData();
    replyForm.set("reply", "تم الرد على طلب الاختبار");
    replyForm.set("actorName", "اسم مزيف");
    assert.equal((await fetch(`${baseUrl}/api/admin/support-requests/${supportRequestId}/reply`, {
      method: "POST", headers: { cookie }, body: replyForm,
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/support-requests/${supportRequestId}/status`, {
      method: "PATCH", headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "in_progress", actorName: "اسم مزيف" }),
    })).status, 200);
    const [savedSupport] = await db.select().from(ownerSupportRequestsTable).where(eq(ownerSupportRequestsTable.id, supportRequestId));
    assert.equal(savedSupport.adminReply, "تم الرد على طلب الاختبار");
    const auditResponse = await fetch(`${baseUrl}/api/admin/audit-log?actorId=${staffId}&entityId=${supportRequestId}`, { headers: adminHeaders() });
    assert.equal(auditResponse.status, 200);
    const audit = await auditResponse.json() as { rows: Array<{ actorName: string; path: string; metadata: { status: string } }> };
    for (const suffix of ["/reply", "/status"]) {
      assert(audit.rows.some((row) =>
        row.path === `/api/admin/support-requests/${supportRequestId}${suffix}`
        && row.actorName === "الاسم المحدّث"
        && row.metadata.status === "completed"));
    }

    const deactivate = await fetch(`${baseUrl}/api/admin/staff/${staffId}/status`, {
      method: "PUT", headers: adminHeaders(), body: JSON.stringify({ isActive: false }),
    });
    assert.equal(deactivate.status, 200);
    assert.equal((await fetch(`${baseUrl}/api/admin/access-check`, { headers: { cookie } })).status, 401);
  });
});