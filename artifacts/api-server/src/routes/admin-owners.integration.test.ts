import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import { db, pool, ownerAccountLinksTable, serviceProviderSubmissionsTable, sessionsTable } from "@workspace/db";

const testAdmin = `owner-directory-admin-${randomUUID()}`;
const originalAdminId = process.env.ADMIN_USER_ID;
const applicationIds: number[] = [];
const submissionIds: number[] = [];
let server: Server;
let baseUrl: string;
let sessionId: string;
let emptyId: number;
let pendingId: number;
let deletedId: number;
let linkedId: number;
let reservedAliasId: number;
const linkedUserId = `directory-linked-${randomUUID()}`;

before(async () => {
  process.env.ADMIN_USER_ID = testAdmin;
  sessionId = await createSession({
    user: { id: testAdmin, email: null, firstName: null, lastName: null, profileImageUrl: null },
    access_token: "integration-test",
  });
  for (const label of ["empty", "pending", "deleted", "linked", "reserved-alias"]) {
    const inserted = await db.execute<{ id: number }>(sql`
      INSERT INTO owner_applications (full_name, business_name, business_type, phone, status, email_verified, password_hash)
      VALUES (${`Directory test ${label} ${randomUUID()}`}, 'Directory test', 'chalet', '0500000000', 'approved', true, '!disabled-test-account')
      RETURNING id
    `);
    applicationIds.push(inserted.rows[0].id);
  }
  [emptyId, pendingId, deletedId, linkedId, reservedAliasId] = applicationIds;
  await db.execute(sql`UPDATE owner_applications SET deleted_at = NOW() WHERE id = ${deletedId}`);
  await db.insert(ownerAccountLinksTable).values({ userId: linkedUserId, ownerApplicationId: linkedId });
  // Reserved aliases must not merge two distinct registered applications.
  await db.insert(ownerAccountLinksTable).values({ userId: `owner_${emptyId}`, ownerApplicationId: reservedAliasId });
  for (const ownerId of [`owner_${pendingId}`, `owner_${linkedId}`, linkedUserId]) {
    const [submission] = await db.insert(serviceProviderSubmissionsTable).values({
      ownerId, businessName: "Directory integration test", category: "test", city: "test",
      whatsappNumber: "0500000000", status: ownerId === linkedUserId ? "approved" : "pending",
    }).returning();
    submissionIds.push(submission.id);
  }
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (submissionIds.length) await db.delete(serviceProviderSubmissionsTable).where(inArray(serviceProviderSubmissionsTable.id, submissionIds));
  await db.delete(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, linkedUserId));
  if (emptyId) await db.delete(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, `owner_${emptyId}`));
  if (applicationIds.length) await db.execute(sql`DELETE FROM owner_applications WHERE id IN (${sql.join(applicationIds.map(id => sql`${id}`), sql`, `)})`);
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  await pool.end();
  if (originalAdminId === undefined) delete process.env.ADMIN_USER_ID;
  else process.env.ADMIN_USER_ID = originalAdminId;
});

it("includes empty registrations, canonicalizes aliases and counts real registrations", async () => {
  const response = await fetch(`${baseUrl}/api/admin/owners`, {
    headers: { authorization: `Bearer ${sessionId}` },
  });
  assert.equal(response.status, 200);
  const owners = await response.json() as Array<{
    ownerId: string; isRegistered: boolean; hasActivity: boolean;
    ownerKind: string; serviceCount: number; whatsappNumber: string;
  }>;
  const empty = owners.find(owner => owner.ownerId === `owner_${emptyId}`);
  assert(empty);
  assert.equal(empty.isRegistered, true);
  assert.equal(empty.hasActivity, false);
  assert.equal(empty.ownerKind, "none");
  assert.equal(empty.whatsappNumber, "0500000000");
  assert(owners.some(owner => owner.ownerId === `owner_${reservedAliasId}` && owner.isRegistered));
  const pending = owners.find(owner => owner.ownerId === `owner_${pendingId}`);
  assert(pending);
  assert.equal(pending.hasActivity, true);
  assert.equal(pending.serviceCount, 0);
  assert(!owners.some(owner => owner.ownerId === `owner_${deletedId}`));
  assert(!owners.some(owner => owner.ownerId === `owner_${linkedId}`));
  const linked = owners.filter(owner => owner.ownerId === linkedUserId);
  assert.equal(linked.length, 1);
  assert.equal(linked[0].isRegistered, true);
  assert.equal(linked[0].hasActivity, true);
  assert.equal(linked[0].serviceCount, 1);
  const expected = await db.execute<{ count: number }>(sql`
    SELECT COUNT(*)::int AS count FROM owner_applications WHERE deleted_at IS NULL
  `);
  assert.equal(owners.filter(owner => owner.isRegistered).length, expected.rows[0].count);
});
