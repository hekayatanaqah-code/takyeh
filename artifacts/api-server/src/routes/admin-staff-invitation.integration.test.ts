import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { db, pool, adminStaffTable, adminAuditLogsTable, sessionsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";
import { hashRecoveryToken } from "../lib/passwordRecovery";
import { inviteAdminStaff, STAFF_INVITE_TTL } from "../lib/staff-invitation";

const prefix = `admin-invite-${randomUUID()}`;
const originalAdminId = process.env.ADMIN_USER_ID;
const originalKey = process.env.TAQNYAT_API_KEY;
const originalFetch = globalThis.fetch;
const ids: number[] = [];
const messages: { to: string; template: { name: string; components: { parameters: { text: string }[] }[] } }[] = [];
let server: Server, origin: string, sid: string;
let providerAccepts = true;
let primaryId: number, activationToken: string, username: string;
const password = "EmployeeOnlyPassword123!";
const arabic = (text: string) => text.replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
const headers = () => ({ authorization: `Bearer ${sid}`, "content-type": "application/json" });
async function request(path: string, body?: unknown, auth = true, method = "POST") {
  return originalFetch(`${origin}/api${path}`, {
    method, headers: auth ? headers() : { "content-type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
before(async () => {
  process.env.ADMIN_USER_ID = prefix;
  process.env.TAQNYAT_API_KEY = "synthetic-template-test-only";
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.taqnyat.sa/wa/v2/messages/") {
      messages.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify(providerAccepts
        ? { type: "template", statuses: { message_id: "synthetic-only" } }
        : { error: "provider_rejected" }), { status: providerAccepts ? 200 : 400 });
    }
    return originalFetch(input, init);
  };
  sid = await createSession({ user: { id: prefix, email: null, firstName: null, lastName: null, profileImageUrl: null }, access_token: "synthetic-only" });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  origin = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  try {
    for (const id of ids) {
      await db.execute(sql`DELETE FROM password_reset_tokens WHERE target_type IN ('admin_staff', 'admin_staff_invite') AND target_id = ${String(id)}`);
      await db.delete(adminStaffTable).where(eq(adminStaffTable.id, id));
      await db.delete(adminAuditLogsTable).where(and(eq(adminAuditLogsTable.entityId, String(id)), sql`${adminAuditLogsTable.path} LIKE '/api/admin/staff%'`));
    }
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
  } finally {
    globalThis.fetch = originalFetch;
    if (originalAdminId === undefined) delete process.env.ADMIN_USER_ID; else process.env.ADMIN_USER_ID = originalAdminId;
    if (originalKey === undefined) delete process.env.TAQNYAT_API_KEY; else process.env.TAQNYAT_API_KEY = originalKey;
    server?.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await pool.end();
  }
});
async function create(extra: Record<string, unknown> = {}) {
  const response = await request("/admin/staff", {
    name: "موظف اختبار الدعوة الإداري", username: `${prefix}-${ids.length}`,
    mobile: "٠٥٥١٢٣٤٥٦٧", personalEmail: `${prefix}-${ids.length}@example.invalid`,
    permissions: {}, ...extra,
  });
  assert.equal(response.status, 201);
  const employee = await response.json() as { id: number; username: string; invitation: string; invitationPending: boolean };
  ids.push(employee.id);
  return employee;
}
it("creates pending staff without an assigned password and sends exactly the approved admin template variables", async () => {
  const employee = await create({ username: `${prefix}-١٢٣`, password: "IgnoredPassword123!" });
  primaryId = employee.id; username = `${prefix}-123`;
  assert.equal(employee.username, username);
  assert.equal(employee.invitation, "accepted");
  assert.equal(employee.invitationPending, true);
  assert(!("passwordHash" in employee));
  const message = messages.at(-1)!;
  assert.equal(message.to, "966551234567");
  assert.equal(message.template.name, "owner_staff_invite");
  const parameters = message.template.components[0].parameters.map(p => p.text);
  assert.equal(parameters.length, 2);
  assert.equal(parameters[0], "موظف اختبار الدعوة الإداري");
  const url = new URL(parameters[1]);
  assert.equal(url.origin, "https://takyeh.sa");
  assert.equal(url.searchParams.get("portalType"), "admin");
  activationToken = url.searchParams.get("token")!;
  const result = await db.execute<{ token: string; expires_at: Date }>(sql`
    SELECT token, expires_at FROM password_reset_tokens
    WHERE target_type = 'admin_staff_invite' AND target_id = ${String(primaryId)}`);
  assert.equal(result.rows[0].token, hashRecoveryToken(activationToken));
  assert(Math.abs(new Date(result.rows[0].expires_at).getTime() - Date.now() - STAFF_INVITE_TTL) < 10_000);
  const [stored] = await db.select().from(adminStaffTable).where(eq(adminStaffTable.id, primaryId));
  assert.equal(stored.passwordHash, "");
  for (const path of ["/admin-staff/login", "/admin-portal-login", "/staff/login"]) {
    const login = await request(path, { username, password: "IgnoredPassword123!" }, false);
    assert.equal(login.status, 401, path);
    assert.equal(login.headers.get("set-cookie"), null);
  }
  const credentials = await request(`/admin/staff/${primaryId}/credentials`, { password }, true, "PUT");
  assert.equal(credentials.status, 409);
});
it("throttles resends and never permits non-superadmin access to the resend endpoint", async () => {
  assert.equal((await request(`/admin/staff/${primaryId}/invitation`)).status, 429);
  assert.equal((await request(`/admin/staff/${primaryId}/invitation`, undefined, false)).status, 401);
});
it("activates only once, accepts either digit keyboard at login, and preserves delegated permissions", async () => {
  const response = await request("/reset-password", { token: activationToken, newPassword: password }, false);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, username, activated: true });
  assert.equal((await request("/reset-password", { token: activationToken, newPassword: "Different123!" }, false)).status, 410);
  for (const value of [username, arabic(username)]) {
    for (const path of ["/admin-staff/login", "/admin-portal-login"]) {
      const login = await request(path, { username: value, password }, false);
      assert.equal(login.status, 200, `${path} ${value}`);
      const cookie = login.headers.get("set-cookie")!.split(";")[0];
      const resend = await originalFetch(`${origin}/api/admin/staff/${primaryId}/invitation`, { method: "POST", headers: { cookie } });
      assert.equal(resend.status, 403);
    }
  }
  assert.equal(await inviteAdminStaff(primaryId), "not_pending");
});
it("keeps failed sends saved and pending, permits a later resend, and does not duplicate employees", async () => {
  providerAccepts = false;
  const employee = await create();
  assert.equal(employee.invitation, "failed");
  const failedToken = new URL(messages.at(-1)!.template.components[0].parameters[1].text).searchParams.get("token")!;
  assert.equal((await request("/reset-password", { token: failedToken, newPassword: password }, false)).status, 410);
  await db.execute(sql`UPDATE password_reset_tokens SET expires_at = ${new Date(Date.now() + STAFF_INVITE_TTL - 120_000)}
    WHERE target_type = 'admin_staff_invite' AND target_id = ${String(employee.id)}`);
  providerAccepts = true;
  const resend = await request(`/admin/staff/${employee.id}/invitation`);
  assert.equal(resend.status, 200);
  const list = await request("/admin/staff", undefined, true, "GET");
  const rows = await list.json() as { id: number; invitationPending: boolean }[];
  assert.equal(rows.filter(row => row.id === employee.id).length, 1);
  assert.equal(rows.find(row => row.id === employee.id)?.invitationPending, true);
});
it("saves staff even without provider credentials and sends nothing when access is disabled", async () => {
  delete process.env.TAQNYAT_API_KEY;
  const employee = await create();
  assert.equal(employee.invitation, "failed");
  const count = messages.length;
  const disabled = await create({ grantAccess: false });
  assert.equal(disabled.invitation, "not_requested");
  assert.equal(messages.length, count);
  process.env.TAQNYAT_API_KEY = "synthetic-template-test-only";
});
it("rejects expired or disabled activation links", async () => {
  for (const disable of [false, true]) {
    const employee = await create();
    const token = randomBytes(32).toString("base64url");
    await db.execute(sql`INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
      VALUES ('admin_staff_invite', ${String(employee.id)}, ${hashRecoveryToken(token)},
        ${new Date(Date.now() + (disable ? STAFF_INVITE_TTL : -1000))})`);
    if (disable) await db.update(adminStaffTable).set({ isActive: false }).where(eq(adminStaffTable.id, employee.id));
    assert.equal((await request("/reset-password", { token, newPassword: password }, false)).status, 410);
  }
});
