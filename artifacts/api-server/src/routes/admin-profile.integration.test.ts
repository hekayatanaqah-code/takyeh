import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, pool, adminStaffTable, adminAuditLogsTable, sessionsTable } from "@workspace/db";
import { eq, inArray, sql } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";

const token = randomUUID();
const password = `Profile-${token}`;
const ids: number[] = [];
const sessions: string[] = [];
let server: Server;
let base: string;
let superCookie: string;
let staffCookie: string;
let adminId: number;
const email = `admin-profile-${token}@example.test`;
async function request(path: string, cookie = "", method = "GET", body?: unknown) {
  return fetch(`${base}/api${path}`, {
    method, headers: { cookie, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
before(async () => {
  for (const isSuperAdmin of [true, false]) {
    const username = `profile-${isSuperAdmin}-${token}`;
    const [account] = await db.insert(adminStaffTable).values({
      name: "Temporary profile test", username, isSuperAdmin, isActive: true,
      passwordHash: await bcrypt.hash(password, 4),
    }).returning({ id: adminStaffTable.id });
    ids.push(account.id);
    if (isSuperAdmin) adminId = account.id;
  }
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const cookies: string[] = [];
  for (const isSuperAdmin of [true, false]) {
    const login = await request("/admin-staff/login", "", "POST", { username: `profile-${isSuperAdmin}-${token}`, password });
    assert.equal(login.status, 200);
    cookies.push(login.headers.get("set-cookie")!.split(";")[0]);
  }
  [superCookie, staffCookie] = cookies;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (ids.length) {
    await db.execute(sql`DELETE FROM password_reset_tokens WHERE target_type = 'admin_staff'
      AND target_id IN (${sql.join(ids.map(id => sql`${String(id)}`), sql`, `)})`);
    await db.delete(adminAuditLogsTable).where(inArray(adminAuditLogsTable.actorId, ids.map(String)));
    await db.delete(adminStaffTable).where(inArray(adminStaffTable.id, ids));
  }
  if (sessions.length) await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessions));
  await pool.end();
});

test("profile requires authentication and superadmin privileges", async () => {
  assert.equal((await request("/admin/profile")).status, 401);
  assert.equal((await request("/admin/profile", staffCookie)).status, 403);
  const response = await request("/admin/profile", superCookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const profile = await response.json() as Record<string, unknown>;
  assert.equal(profile.email, "");
  assert.equal("passwordHash" in profile, false);
  assert.equal("fallbackEmail" in profile, false);
});

test("profile validates password, persists contact data and revokes old reset links", async () => {
  assert.equal((await request("/admin/profile", superCookie, "PATCH", { email, mobile: "0501234567", currentPassword: "wrong" })).status, 401);
  assert.equal((await request("/admin/profile", superCookie, "PATCH", { email, mobile: "05123", currentPassword: password })).status, 400);
  const resetToken = `test-only-${token}`;
  await db.execute(sql`INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
    VALUES ('admin_staff', ${String(adminId)}, ${resetToken}, now() + interval '1 hour')`);
  assert.equal((await request("/admin/profile", superCookie, "PATCH", { email, mobile: "0501234567", currentPassword: password })).status, 200);
  const profile = await (await request("/admin/profile", superCookie)).json() as Record<string, unknown>;
  assert.equal(profile.email, email);
  assert.equal(profile.mobile, "0501234567");
  const result = await db.execute(sql`SELECT used FROM password_reset_tokens WHERE token = ${resetToken}`);
  assert.equal(result.rows[0]?.used, true);
});

test("logout revokes the actual admin session but preserves unrelated owner authentication", async () => {
  const unrelatedSid = await createSession({
    user: { id: `unrelated-owner-${token}`, email: null, firstName: null, lastName: null, profileImageUrl: null },
    access_token: "owner_password_auth",
  });
  sessions.push(unrelatedSid);
  const response = await request("/admin-staff/logout", `${superCookie}; sid=${unrelatedSid}`, "POST");
  assert.equal(response.status, 200);
  assert.equal((await request("/admin/profile", superCookie)).status, 401);
  const [ownerSession] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, unrelatedSid));
  assert.ok(ownerSession);
});
