import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { db, pool, chaletSubmissionsTable, ownerSubscriptionsTable, sessionsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";
import { ownerPlanAccess } from "../lib/subscription-access";

test("rejected properties release quota and resubmission atomically reuses it", { timeout: 30000 }, async () => {
  const ownerId = `quota-test-${randomUUID()}`;
  const server = createServer(app);
  let sessionId = "";
  try {
    await db.insert(ownerSubscriptionsTable).values({
      ownerId, plan: "trial", status: "active", paymentStatus: "free",
      expiresAt: new Date(Date.now() + 86400000),
      termsSnapshot: {
        nameAr: "باقة اختبار", scope: "property", features: [],
        chaletLimit: 1, serviceLimit: 0,
      },
    });
    const properties = await db.insert(chaletSubmissionsTable).values([0, 1].map(i => ({
      ownerId, nameAr: `عقار اختبار ${ownerId} ${i}`,
      whatsappNumber: `050999887${i}`, location: "بريدة", district: "حي اختبار",
      status: "rejected" as const, adminNote: "يرجى تصحيح الوصف",
      descriptionAr: "الوصف السابق", pricePerNight: "100", photos: ["/test-photo.jpg"],
      logoUrl: "/test-logo.jpg", termsAndConditions: "شروط الاختبار",
    }))).returning();
    assert.equal((await ownerPlanAccess(ownerId)).chaletCount, 0);
    sessionId = await createSession({
      user: { id: ownerId, email: null, firstName: "اختبار", lastName: null, profileImageUrl: null },
      access_token: "integration-test",
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const send = (id: number) => fetch(`${base}/api/owner/submissions/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${sessionId}`, "Content-Type": "application/json" },
      body: JSON.stringify({ descriptionAr: "تم تصحيح الوصف لإعادة المراجعة" }),
    });
    // Two rejected requests compete for one slot: only one may become pending.
    const responses = await Promise.all(properties.map(property => send(property.id)));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 403]);
    const saved = await db.select().from(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.ownerId, ownerId));
    assert.equal(saved.length, 2, "resubmission must not create a new record");
    assert.equal(saved.filter(p => p.status === "pending").length, 1);
    assert.equal(saved.filter(p => p.status === "rejected").length, 1);
    const submitted = saved.find(p => p.status === "pending")!;
    assert.equal(submitted.adminNote, "يرجى تصحيح الوصف");
    assert.equal(submitted.logoUrl, "/test-logo.jpg");
    assert.deepEqual(submitted.photos, ["/test-photo.jpg"]);
    assert.equal((await ownerPlanAccess(ownerId)).chaletCount, 1);
    await db.update(chaletSubmissionsTable).set({ status: "rejected" })
      .where(eq(chaletSubmissionsTable.id, submitted.id));
    assert.equal((await ownerPlanAccess(ownerId)).chaletCount, 0);
    await db.update(ownerSubscriptionsTable).set({ status: "expired" })
      .where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    assert.equal((await send(submitted.id)).status, 403);
    const [stillRejected] = await db.select().from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, submitted.id));
    assert.equal(stillRejected.status, "rejected");
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await db.delete(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.ownerId, ownerId));
    await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
    if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
    await db.execute(sql`DELETE FROM owner_account_links WHERE user_id = ${ownerId}`);
    await pool.end();
  }
});
