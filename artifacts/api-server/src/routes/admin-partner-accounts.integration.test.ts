import assert from "node:assert/strict";
import { before, after, test, mock } from "node:test";
import { createServer, type Server } from "node:http";
import type { Request } from "express";
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, pool, adminStaffTable, adminSessionsTable, photographersTable, photographerSessionsTable, ownerAccountLinksTable, adminAuditLogsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { createSession, getSession } from "../lib/auth";
import { getOwnerIds } from "./owner";
import { ownerSecurityNotification } from "../lib/owner-security-notification";

const prefix = `qa-partners-${randomBytes(5).toString("hex")}`;
const phone = `059${randomInt(1000000, 9999999)}`;
const nextPhone = `058${randomInt(1000000, 9999999)}`;
const email = `${prefix}@example.invalid`, nextEmail = `${prefix}-updated@example.invalid`;
const ownerPassword = "OwnerBefore2026!", photoPassword = "PhotoBefore2026!";
const ownerNew = "OwnerAfter2026!", photoNew = "PhotoAfter2026!";
let owner = 0, otherOwner = 0, photographer = 0, invitation = 0, manager = 0, deniedManager = 0;
let server: Server, origin: string, ownerSid = "", newOwnerSid = "", photoSid = "", oldFlag: unknown;
const managerSid = randomBytes(32).toString("hex"), deniedSid = randomBytes(32).toString("hex");
const tokens = new Set<string>();
const reason = "استعادة طارئة بطلب المالك بعد التحقق من هويته";
const notices: { to: string; body: string }[] = [];
const delivery = mock.method(ownerSecurityNotification, "prepare", async () => ({
  async send(message: { to: string; body: string }) { notices.push(message); return { messageId: `${prefix}-accepted` }; },
}));

async function request(path: string, body?: unknown, cookie = `admin_staff_sid=${managerSid}`, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`${origin}/api${path}`, {
    method, headers: { Origin: origin, Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  for (const value of response.headers.getSetCookie()) {
    const token = value.split(";")[0].split("=")[1];
    if (/^[a-f0-9]{64}$/.test(token)) tokens.add(token);
  }
  return { status: response.status, data: await response.json() as any, cookies: response.headers.getSetCookie() };
}
const challenge = (response: Awaited<ReturnType<typeof request>>) => response.cookies.find(c => c.startsWith("role_login_challenge=") && !c.startsWith("role_login_challenge=;"))!.split(";")[0];
before(async () => {
  oldFlag = (await db.execute(sql`SELECT value FROM site_settings WHERE key='photography_enabled'`)).rows[0]?.value;
  const hash = await bcrypt.hash(ownerPassword, 4);
  for (let i = 0; i < 2; i++) {
    const row = await db.execute<{ id: number }>(sql`INSERT INTO owner_applications(full_name,business_name,business_type,phone,email,password_hash,status,email_verified)
      VALUES(${prefix},${prefix},'chalet',${i ? `057${randomInt(1000000, 9999999)}` : phone},${i ? `${prefix}-other@example.invalid` : email},${hash},'approved',${!!i}) RETURNING id`);
    if (i) otherOwner = row.rows[0].id; else owner = row.rows[0].id;
  }
  const [p] = await db.insert(photographersTable).values({ name: prefix, whatsapp: `966${phone.slice(1)}`, email, passwordHash: await bcrypt.hash(photoPassword, 4), status: "approved" }).returning();
  photographer = p.id;
  const [invited] = await db.insert(photographersTable).values({ name: prefix, whatsapp: `96656${randomInt(1000000, 9999999)}`, status: "invited" }).returning();
  invitation = invited.id;
  for (let i = 0; i < 2; i++) {
    const [staff] = await db.insert(adminStaffTable).values({ name: prefix, username: `${prefix}-${i}`, passwordHash: hash, permissions: i ? {} : { userManagement: true } }).returning();
    if (i) deniedManager = staff.id; else manager = staff.id;
    await db.insert(adminSessionsTable).values({ sid: i ? deniedSid : managerSid, adminStaffId: staff.id, expire: new Date(Date.now() + 600000) });
  }
  // A malformed historical alias must never retarget an owner password session.
  await db.insert(ownerAccountLinksTable).values({ userId: `owner_${owner}`, ownerApplicationId: otherOwner });
  ownerSid = await createSession({ user: { id: `owner_${owner}`, email, firstName: prefix, lastName: null, profileImageUrl: null }, access_token: "owner_password_auth", ownerApplicationId: owner });
  tokens.add(ownerSid);
  const [ps] = await db.insert(photographerSessionsTable).values({ photographerId: photographer, hash: randomBytes(32).toString("hex"), expiresAt: new Date(Date.now() + 600000) }).returning();
  photoSid = ps.hash;
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  for (const token of tokens) await db.execute(sql`DELETE FROM sessions WHERE sid=${token}`);
  await db.delete(adminAuditLogsTable).where(eq(adminAuditLogsTable.actorName, prefix));
  for (const id of [manager, deniedManager].filter(Boolean)) {
    await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminStaffId, id));
    await db.delete(adminStaffTable).where(eq(adminStaffTable.id, id));
  }
  for (const id of [photographer, invitation].filter(Boolean)) {
    await db.delete(photographerSessionsTable).where(eq(photographerSessionsTable.photographerId, id));
    await db.delete(photographersTable).where(eq(photographersTable.id, id));
  }
  if (owner) await db.delete(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, `owner_${owner}`));
  for (const id of [owner, otherOwner].filter(Boolean)) {
    await db.execute(sql`DELETE FROM owner_subscriptions WHERE owner_id=${`owner_${id}`}`);
    await db.execute(sql`DELETE FROM owner_applications WHERE id=${id} AND full_name LIKE ${prefix + "%"}`);
  }
  assert.equal((await db.execute(sql`SELECT value FROM site_settings WHERE key='photography_enabled'`)).rows[0]?.value, oldFlag);
  await pool.end();
  delivery.mock.restore();
});

test("user-management permission is required for listing, editing and password reset", async () => {
  for (const [path, body, method] of [
    ["/admin/partner-accounts/photographers", undefined, "GET"],
    [`/admin/partner-accounts/owner/${owner}`, { name: prefix, phone, email }, "PATCH"],
    [`/admin/partner-accounts/owner/${owner}/password`, { password: ownerNew }, "POST"],
  ] as const) assert.equal((await request(path, body, `admin_staff_sid=${deniedSid}`, method)).status, 403);
});
test("reserved alias links cannot resolve the profile of a different owner", async () => {
  const result = await request("/owner/profile", undefined, `sid=${ownerSid}`);
  assert.equal(result.status, 200);
  assert.equal(result.data.email, email);
  assert.deepEqual(await getOwnerIds({ user: { id: `owner_${otherOwner}` } } as Request), [`owner_${otherOwner}`]);
});
test("administrators cannot edit owner personal information even by direct API request", async () => {
  assert.equal((await request(`/admin/partner-accounts/owner/${owner}`, { name: `${prefix}-edited`, phone: nextPhone, email: nextEmail.toUpperCase() }, undefined, "PATCH")).status, 403);
  const directory = await request("/admin/owners");
  const row = directory.data.find((r: any) => r.accountId === owner);
  assert.equal(row.email, email);
  assert.equal(row.whatsappNumber, phone);
  assert.equal(row.ownerName, prefix);
  const ph = await request("/admin/partner-accounts/photographers");
  assert.equal(ph.data.find((r: any) => r.id === photographer).email, email);
  assert.equal("passwordHash" in ph.data[0], false);
  assert.equal((await request(`/admin/partner-accounts/owner/${otherOwner}`, { name: prefix, phone: nextPhone, email: nextEmail }, undefined, "PATCH")).status, 403);
});
test("owners retain their own personal profile editing", async () => {
  const result = await request("/owner/profile", { fullName: `${prefix}-self`, phone, email }, `sid=${ownerSid}`, "PUT");
  assert.equal(result.status, 200);
  const profile = await request("/owner/profile", undefined, `sid=${ownerSid}`);
  assert.equal(profile.data.fullName, `${prefix}-self`);
});
test("cross-role sharing remains valid for photographer edits", async () => {
  assert.equal((await request(`/admin/partner-accounts/photographer/${photographer}`, { name: prefix, phone, email }, undefined, "PATCH")).status, 200);
});
test("missing or blank emergency reasons cannot change credentials", async () => {
  for (const body of [{ password: ownerNew }, { password: ownerNew, reason: "   " }]) {
    assert.equal((await request(`/admin/partner-accounts/owner/${owner}/password`, body)).status, 400);
  }
  assert.notEqual(await getSession(ownerSid), null);
  assert.equal(notices.length, 0);
});
test("unavailable or rejected WhatsApp delivery leaves the password and sessions unchanged", async () => {
  delivery.mock.mockImplementationOnce(async () => null as any);
  assert.equal((await request(`/admin/partner-accounts/owner/${owner}/password`, { password: ownerNew, reason })).status, 503);
  delivery.mock.mockImplementationOnce(async () => ({ async send() { throw new Error("Simulated provider outage"); } }));
  assert.equal((await request(`/admin/partner-accounts/owner/${owner}/password`, { password: ownerNew, reason })).status, 502);
  assert.notEqual(await getSession(ownerSid), null);
  const row = await db.execute<{ password_hash: string }>(sql`SELECT password_hash FROM owner_applications WHERE id=${owner}`);
  assert(await bcrypt.compare(ownerPassword, row.rows[0].password_hash));
});
test("owner recovery enables password login and revokes owner sessions only", async () => {
  assert.equal((await request(`/admin/partner-accounts/owner/${owner}/password`, { password: ownerNew, reason })).status, 200);
  assert.deepEqual(notices.map(notice => notice.to), [`966${phone.slice(1)}`]);
  assert(notices[0].body.includes("الدعم الفني"));
  assert(notices[0].body.includes("مراجعة حسابك"));
  assert.equal(notices[0].body.includes(ownerNew), false);
  assert.equal(await getSession(ownerSid), null);
  assert.equal((await db.select().from(photographerSessionsTable).where(eq(photographerSessionsTable.hash, photoSid))).length, 1);
  assert.equal((await request("/auth/role-login", { identifier: email, password: ownerPassword }, "")).status, 401);
  const login = await request("/auth/role-login", { identifier: phone, password: ownerNew }, "");
  assert.equal(login.data.requiresRole, true);
  const selected = await request("/auth/select-role", { key: `owner:${owner}` }, challenge(login));
  assert.equal(selected.status, 200);
  const sid = selected.cookies.find(value => value.startsWith("sid="))!.split(";")[0].slice(4);
  newOwnerSid = sid;
  assert.equal((await getSession(sid))?.ownerApplicationId, owner);
});
test("photographer reset rejects old passwords and invalidates old role choices", async () => {
  const previous = await request("/auth/role-login", { identifier: email, password: photoPassword }, "");
  assert.equal((await request(`/admin/partner-accounts/photographer/${photographer}/password`, { password: photoNew })).status, 200);
  assert.notEqual(await getSession(newOwnerSid), null);
  assert.equal((await request("/auth/select-role", { key: `photographer:${photographer}` }, challenge(previous))).status, 401);
  assert.equal((await request("/auth/role-login", { identifier: email, password: photoPassword }, "")).status, 401);
  const current = await request("/auth/role-login", { identifier: email, password: ownerNew }, "");
  assert.equal((await request("/auth/select-role", { key: `photographer:${photographer}`, password: photoNew }, challenge(current))).status, 200);
});
test("incomplete invitations and short passwords cannot bypass registration", async () => {
  assert.equal((await request(`/admin/partner-accounts/photographer/${invitation}/password`, { password: photoNew })).status, 409);
  assert.equal((await request(`/admin/partner-accounts/owner/${owner}/password`, { password: "short" })).status, 400);
});
test("administrative actions are audited without storing passwords", async () => {
  const rows = await db.select().from(adminAuditLogsTable).where(eq(adminAuditLogsTable.actorName, prefix));
  assert(rows.length >= 4);
  const data = JSON.stringify(rows);
  for (const secret of [ownerPassword, photoPassword, ownerNew, photoNew]) assert.equal(data.includes(secret), false);
  const successful = rows.find(row => row.metadata.status === "completed" && row.metadata.reason === reason);
  assert(successful);
  assert.equal(successful.actorName, prefix);
  assert.equal(successful.actorId, String(manager));
  assert.equal(successful.targetOwnerId, `owner_${owner}`);
  assert(successful.createdAt instanceof Date);
  assert.deepEqual(successful.metadata.targetAccount, { kind: "owner", id: owner, name: `${prefix}-self` });
  assert.equal((successful.metadata.whatsappNotification as any).status, "accepted");
});
