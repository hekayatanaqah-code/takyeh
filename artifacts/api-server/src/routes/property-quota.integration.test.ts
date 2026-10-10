import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, pool, chaletSubmissionsTable, chaletsTable, ownerSubscriptionsTable, sessionsTable, adminAuditLogsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";
import { ownerPlanAccess } from "../lib/subscription-access";

test("admin decisions publish, return for revision, and permanently close rejected properties", { timeout: 30000 }, async () => {
  const ownerId = `quota-test-${randomUUID()}`;
  const adminId = `quota-admin-test-${randomUUID()}`;
  const server = createServer(app);
  let sessionId = "";
  let adminSessionId = "";
  // Isolated child test process only; never read or alter the workspace secret.
  process.env.ADMIN_USER_ID = adminId;
  try {
    await db.insert(ownerSubscriptionsTable).values({
      ownerId, plan: "trial", status: "active", paymentStatus: "free",
      expiresAt: new Date(Date.now() + 86400000),
      termsSnapshot: { nameAr: "باقة اختبار", scope: "property", features: [], chaletLimit: 1, serviceLimit: 0 },
    });
    const [property] = await db.insert(chaletSubmissionsTable).values({
      ownerId, nameAr: `عقار اختبار ${ownerId}`, whatsappNumber: "0509998870",
      location: "بريدة", district: "حي اختبار", status: "pending",
      descriptionAr: "الوصف السابق", pricePerNight: "100", photos: ["/test-photo.jpg"],
      logoUrl: "/test-logo.jpg", termsAndConditions: "شروط الاختبار",
    }).returning();
    const makeSession = (id: string) => createSession({
      user: { id, email: null, firstName: "اختبار", lastName: null, profileImageUrl: null },
      access_token: "integration-test",
    });
    sessionId = await makeSession(ownerId);
    adminSessionId = await makeSession(adminId);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const request = (path: string, session: string, body: unknown) => fetch(`${base}/api/${path}`, {
      method: "PATCH", headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const decide = (status: string, adminNote?: string) =>
      request(`admin/submissions/${property.id}/status`, adminSessionId, { status, adminNote });
    const edit = () => request(`owner/submissions/${property.id}`, sessionId, { descriptionAr: "الوصف بعد التعديل" });
    assert.equal((await ownerPlanAccess(ownerId)).chaletCount, 1);
    assert.equal((await decide("needs_revision")).status, 400, "revision requires a reason");
    assert.equal((await decide("needs_revision", "صحّح الوصف")).status, 200);
    let [record] = await db.select().from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, property.id));
    assert.equal(record.status, "needs_revision");
    assert.equal(record.adminNote, "صحّح الوصف");
    assert.equal((await ownerPlanAccess(ownerId)).chaletCount, 1, "revision keeps its reserved slot");
    assert.equal((await edit()).status, 200, "revision is allowed even at 1 / 1 quota");
    [record] = await db.select().from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, property.id));
    assert.equal(record.status, "pending");
    assert.equal(record.descriptionAr, "الوصف بعد التعديل");
    assert.equal(record.logoUrl, "/test-logo.jpg");
    assert.equal((await decide("approved")).status, 200);
    assert.equal((await decide("approved")).status, 200, "repeated approval must not duplicate publication");
    const published = await db.select().from(chaletsTable).where(eq(chaletsTable.submissionId, property.id));
    assert.equal(published.length, 1);
    assert.equal(published[0].isActive, true);
    assert.equal(published[0].descriptionAr, "الوصف بعد التعديل");
    assert.equal((await ownerPlanAccess(ownerId)).chaletCount, 1);
    assert.equal((await decide("needs_revision", "أضف التفاصيل")).status, 200);
    let [mirror] = await db.select().from(chaletsTable).where(eq(chaletsTable.submissionId, property.id));
    assert.equal(mirror.isActive, false, "returned properties must not remain public");
    assert.equal((await edit()).status, 200);
    assert.equal((await decide("approved")).status, 200);
    assert.equal((await decide("rejected")).status, 400, "rejection requires a reason");
    assert.equal((await decide("rejected", "رفض نهائي")).status, 200);
    assert.equal((await ownerPlanAccess(ownerId)).chaletCount, 0);
    [mirror] = await db.select().from(chaletsTable).where(eq(chaletsTable.submissionId, property.id));
    assert.equal(mirror.isActive, false);
    assert.equal((await edit()).status, 409, "rejected requests cannot be edited or resubmitted");
    assert.equal((await request(`submissions/${property.id}`, sessionId, { descriptionAr: "محاولة إعادة" })).status, 409);
    assert.equal((await decide("approved")).status, 409, "admins cannot reopen rejected requests");
    assert.equal((await decide("needs_revision", "إعادة فتح")).status, 409);
    assert.equal((await request(`owner/chalets/${mirror.id}/toggle-active`, sessionId, {})).status, 409);
    await db.insert(chaletSubmissionsTable).values({
      ownerId, nameAr: `عقار جديد ${ownerId}`, whatsappNumber: "0509998871", location: "بريدة",
      pricePerNight: "100", descriptionAr: "عقار آخر", status: "pending",
    });
    assert.equal((await ownerPlanAccess(ownerId)).chaletCount, 1, "new requests can consume the freed slot");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(chaletsTable).where(eq(chaletsTable.ownerId, ownerId));
    await db.delete(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.ownerId, ownerId));
    await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
    if (adminSessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, adminSessionId));
    await db.delete(adminAuditLogsTable).where(eq(adminAuditLogsTable.actorId, adminId));
    await db.execute(sql`DELETE FROM owner_account_links WHERE user_id = ${ownerId}`);
    await pool.end();
  }
});
