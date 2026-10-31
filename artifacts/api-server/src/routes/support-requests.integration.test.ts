import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer, type Server } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import { db, pool, adminStaffTable, adminSessionsTable, adminAuditLogsTable, ownerAccountLinksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import app from "../app";

const prefix = `qa-support-${randomBytes(6).toString("hex")}`;
const sid = randomBytes(32).toString("hex");
const externalId = `${prefix}-external`;
let server: Server, origin: string, staffId = 0;
const owners: number[] = [], tickets: number[] = [];
async function request(path: string, body?: unknown, method = body ? "POST" : "GET") {
  const response = await fetch(`${origin}/api/admin${path}`, {
    method, headers: { Origin: origin, Cookie: `admin_staff_sid=${sid}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() as any };
}
before(async () => {
  const [staff] = await db.insert(adminStaffTable).values({
    name: prefix, username: prefix, passwordHash: "fixture-no-password-login", permissions: { supportDisputes: true },
  }).returning();
  staffId = staff.id;
  await db.insert(adminSessionsTable).values({ sid, adminStaffId: staffId, expire: new Date(Date.now() + 600_000) });
  for (let i = 0; i < 2; i++) {
    const row = await db.execute<{ id: number }>(sql`
      INSERT INTO owner_applications(full_name,business_name,business_type,phone,email,password_hash,status)
      VALUES(${`${prefix}-مالك-${i}`},${prefix},'chalet',${`059${randomInt(1000000, 9999999)}`},
        ${`${prefix}-${i}@example.invalid`},'fixture-no-password-login','approved') RETURNING id`);
    owners.push(row.rows[0].id);
  }
  await db.insert(ownerAccountLinksTable).values([
    { userId: externalId, ownerApplicationId: owners[0] },
    // Reserved aliases must never resolve through an incorrect historical link.
    { userId: `owner_${owners[0]}`, ownerApplicationId: owners[1] },
  ]);
  for (const ownerId of [`owner_${owners[0]}`, externalId, `${prefix}-unknown`]) {
    const row = await db.execute<{ id: number }>(sql`
      INSERT INTO owner_support_requests(owner_id,owner_name,subject,message,status)
      VALUES(${ownerId},${ownerId.startsWith("owner_") ? ownerId : null},${prefix},'رسالة اختبار معزولة','new') RETURNING id`);
    tickets.push(row.rows[0].id);
  }
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (const id of tickets) await db.execute(sql`DELETE FROM owner_support_requests WHERE id=${id} AND subject=${prefix}`);
  await db.delete(adminAuditLogsTable).where(eq(adminAuditLogsTable.actorName, prefix));
  if (staffId) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminStaffId, staffId));
    await db.delete(adminStaffTable).where(eq(adminStaffTable.id, staffId));
  }
  await db.delete(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, externalId));
  if (owners[0]) await db.delete(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, `owner_${owners[0]}`));
  for (const id of owners) {
    await db.execute(sql`DELETE FROM owner_subscriptions WHERE owner_id=${`owner_${id}`}`);
    await db.execute(sql`DELETE FROM owner_applications WHERE id=${id} AND business_name=${prefix}`);
  }
  await pool.end();
});
test("support names resolve real profiles, keep reserved identities separate and group genuine aliases", async () => {
  const result = await request(`/support-requests?ownerId=owner_${owners[0]}`);
  assert.equal(result.status, 200);
  const rows = result.body.filter((row: any) => tickets.includes(row.id));
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.owner_name, `${prefix}-مالك-0`);
    assert.equal(row.owner_group_id, externalId);
  }
  const unknown = await request(`/support-requests?ownerId=${prefix}-unknown`);
  assert.equal(unknown.body[0].owner_name, "مالك غير مسمى");
});
test("reply atomically persists replied status and subsequent explicit statuses remain authoritative", async () => {
  for (const status of ["new", "in_progress", "resolved"]) {
    const changed = await request(`/support-requests/${tickets[0]}/status`, { status }, "PATCH");
    assert.equal(changed.status, 200);
    assert.equal(changed.body.status, status);
    const replied = await request(`/support-requests/${tickets[0]}/reply`, { reply: `رد اختبار ${status}` });
    assert.equal(replied.status, 200);
    assert.equal(replied.body.status, "replied");
    assert.equal(replied.body.is_read_by_owner, false);
    const persisted = await db.execute(sql`SELECT status,admin_reply FROM owner_support_requests WHERE id=${tickets[0]}`);
    assert.equal(persisted.rows[0].status, "replied");
    assert.equal(persisted.rows[0].admin_reply, `رد اختبار ${status}`);
  }
  const empty = await request(`/support-requests/${tickets[0]}/reply`, { reply: " " });
  assert.equal(empty.status, 400);
  const invalid = await request(`/support-requests/${tickets[0]}/status`, { status: "not-a-state" }, "PATCH");
  assert.equal(invalid.status, 400);
  const missing = await request("/support-requests/0/reply", { reply: "اختبار" });
  assert.equal(missing.status, 404);
});
