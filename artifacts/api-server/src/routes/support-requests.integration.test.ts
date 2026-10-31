import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { createServer, type Server } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import { db, pool, adminStaffTable, adminSessionsTable, adminAuditLogsTable, ownerAccountLinksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { createSession, deleteSession } from "../lib/auth";

const prefix = `qa-support-${randomBytes(6).toString("hex")}`;
const sid = randomBytes(32).toString("hex");
const externalId = `${prefix}-external`;
let server: Server, origin: string, staffId = 0;
const owners: number[] = [], tickets: number[] = [];
const ownerSessions: string[] = [];
async function ownerRequest(owner: number, path: string, body?: unknown) {
  const response = await fetch(`${origin}/api/owner${path}`, {
    method: body ? "POST" : "GET",
    headers: { Origin: origin, Cookie: `sid=${ownerSessions[owner]}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() as any };
}
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
    ownerSessions.push(await createSession({
      user: { id: `owner_${row.rows[0].id}`, email: `${prefix}-${i}@example.invalid`, firstName: prefix, lastName: null, profileImageUrl: null },
      access_token: "owner_password_auth", ownerApplicationId: row.rows[0].id,
    }));
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
  for (const session of ownerSessions) await deleteSession(session);
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
    if (status === "resolved") {
      const closedReply = await request(`/support-requests/${tickets[0]}/reply`, { reply: "رد يجب رفضه" });
      assert.equal(closedReply.status, 409);
      await request(`/support-requests/${tickets[0]}/status`, { status: "in_progress" }, "PATCH");
    }
    const replied = await request(`/support-requests/${tickets[0]}/reply`, { reply: `رد اختبار ${status}` });
    assert.equal(replied.status, 200);
    assert.equal(replied.body.status, "replied");
    assert.equal(replied.body.is_read_by_owner, false);
    assert.equal(replied.body.ticket.id, tickets[0]);
    assert.equal(replied.body.ticket.status, "replied");
    assert.equal(replied.body.ticket.admin_reply, `رد اختبار ${status}`);
    assert.equal(replied.body.ticket.owner_name, `${prefix}-مالك-0`);
    assert.equal(replied.body.ticket.subject, prefix);
    assert.equal(replied.body.ticket.message, "رسالة اختبار معزولة");
    assert.ok(replied.body.ticket.admin_reply_at);
    assert.deepEqual(replied.body.ticket.admin_attachment_urls, []);
    const listed = await request(`/support-requests?ownerId=owner_${owners[0]}`);
    assert.deepEqual(replied.body.ticket, listed.body.find((row: any) => row.id === tickets[0]));
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
test("continuous owner/admin conversation preserves every reply and only manual closure prevents further sends", async () => {
  const denied = await ownerRequest(1, `/support-requests/${tickets[0]}/reply`, { message: "محاولة من مالك آخر", owner_id: `owner_${owners[0]}` });
  assert.equal(denied.status, 404);
  for (const message of ["استفسار متابعة أول", "استفسار متابعة ثان"]) {
    const sent = await ownerRequest(0, `/support-requests/${tickets[0]}/reply`, { message });
    assert.equal(sent.status, 200);
    assert.equal(sent.body.ticket.status, "in_progress");
    assert.equal(sent.body.ticket.messages.at(-1).body, message);
    assert.equal(sent.body.ticket.messages.at(-1).author_role, "owner");
  }
  const sent = await request(`/support-requests/${tickets[0]}/reply`, { reply: "رد جديد دون حذف السابق" });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.ticket.messages.length, 6);
  assert.deepEqual(sent.body.ticket.messages.map((message: any) => message.author_role), ["admin", "admin", "admin", "owner", "owner", "admin"]);
  const visible = await ownerRequest(0, "/support-requests");
  const visibleTicket = visible.body.find((ticket: any) => ticket.id === tickets[0]);
  assert.equal(visibleTicket.status, "replied");
  assert.equal(visibleTicket.is_read_by_owner, false);
  assert.deepEqual(visibleTicket.messages, sent.body.ticket.messages);
  const unread = await ownerRequest(0, "/support-requests/unread-count");
  assert.ok(unread.body.count > 0);
  await request(`/support-requests/${tickets[0]}/status`, { status: "resolved" }, "PATCH");
  assert.equal((await ownerRequest(0, `/support-requests/${tickets[0]}/reply`, { message: "تذكرة مقفلة" })).status, 409);
  assert.equal((await request(`/support-requests/${tickets[0]}/reply`, { reply: "تذكرة مقفلة" })).status, 409);
  const closed = (await ownerRequest(0, "/support-requests")).body.find((ticket: any) => ticket.id === tickets[0]);
  assert.equal(closed.status, "resolved");
  assert.equal(closed.messages.length, 6);
});
test("legacy reply and attachments survive first follow-up without inventing its missing timestamp", async () => {
  await db.execute(sql`UPDATE owner_support_requests SET admin_reply='رد سابق محفوظ',
    admin_reply_at=NULL, admin_attachment_urls=ARRAY['/support-test/legacy.pdf'] WHERE id=${tickets[1]}`);
  const result = await ownerRequest(0, `/support-requests/${tickets[1]}/reply`, { message: "متابعة الرد السابق" });
  assert.equal(result.status, 200);
  assert.equal(result.body.ticket.messages.length, 2);
  assert.equal(result.body.ticket.messages[0].body, "رد سابق محفوظ");
  assert.equal(result.body.ticket.messages[0].created_at, null);
  assert.deepEqual(result.body.ticket.messages[0].attachment_urls, ["/support-test/legacy.pdf"]);
  await ownerRequest(0, `/support-requests/${tickets[1]}/reply`, { message: "متابعة أخرى" });
  const count = await db.execute(sql`SELECT COUNT(*)::int AS count FROM owner_support_messages WHERE ticket_id=${tickets[1]}`);
  assert.equal(count.rows[0].count, 3);
  assert.equal((await ownerRequest(0, `/support-requests/${tickets[1]}/reply`, { message: " " })).status, 400);
  assert.equal((await ownerRequest(0, `/support-requests/${tickets[1]}/reply`, { message: "س".repeat(2001) })).status, 400);
});
test("simultaneous administrator replies append safely and do not attach an older file to a new reply", async () => {
  const replies = await Promise.all(["رد متزامن أول", "رد متزامن ثان"].map(reply =>
    request(`/support-requests/${tickets[1]}/reply`, { reply })));
  for (const result of replies) assert.equal(result.status, 200);
  const listed = (await request(`/support-requests?ownerId=owner_${owners[0]}`)).body.find((ticket: any) => ticket.id === tickets[1]);
  assert.equal(listed.messages.length, 5);
  assert.deepEqual(new Set(listed.messages.slice(-2).map((message: any) => message.body)), new Set(["رد متزامن أول", "رد متزامن ثان"]));
  assert.deepEqual(listed.messages[0].attachment_urls, ["/support-test/legacy.pdf"]);
  assert.deepEqual(listed.admin_attachment_urls, []);
  assert.equal(listed.admin_reply, listed.messages.at(-1).body);
});
