import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, it } from "node:test";
import bcrypt from "bcryptjs";
import express from "express";
import { db, pool, ownerStaffTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { inviteOwnerStaff, STAFF_INVITE_TARGET, STAFF_INVITE_TTL } from "../lib/staff-invitation";
import { hashRecoveryToken } from "../lib/passwordRecovery";
import { createPasswordResetRouter } from "./passwordReset";
import staffAuth from "./staffAuth";

const ownerId = `staff-invite-test-${randomUUID()}`;
const ids: number[] = [];
let server: Server;
let baseUrl = "";
const sent: { phone: string; template: string; parameters: string[]; language?: string }[] = [];
const sender = async (phone: string, template: string, parameters: string[], language?: string) => {
  sent.push({ phone, template, parameters, language });
  return { success: true };
};
async function pending() {
  const [row] = await db.insert(ownerStaffTable).values({
    ownerId, name: "موظف اختبار الدعوة", phoneNum: "٠٥٥١٢٣٤٥٦٧",
    username: `staff_${randomBytes(10).toString("hex")}`, baseSalary: "0",
    permissions: { dashboardAccess: true, financialAccess: false },
  }).returning();
  ids.push(row.id);
  return row;
}
async function reset(token: string, password = "InvitePassword123!") {
  return fetch(`${baseUrl}/reset-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, newPassword: password }),
  });
}
async function fixtureToken(id: number, expiresAt: Date) {
  const token = randomBytes(32).toString("base64url");
  await db.execute(sql`INSERT INTO password_reset_tokens (target_type, target_id, token, expires_at)
    VALUES (${STAFF_INVITE_TARGET}, ${String(id)}, ${hashRecoveryToken(token)}, ${expiresAt})`);
  return token;
}
before(async () => {
  const app = express();
  app.use(express.json());
  app.use(createPasswordResetRouter());
  app.use(staffAuth);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  try {
    for (const id of ids) {
      await db.execute(sql`DELETE FROM password_reset_tokens WHERE target_type = ${STAFF_INVITE_TARGET} AND target_id = ${String(id)}`);
      await db.delete(ownerStaffTable).where(eq(ownerStaffTable.id, id));
    }
  } finally {
    server?.closeAllConnections();
    await new Promise<void>(resolve => server?.close(() => resolve()));
    await pool.end();
  }
});

it("sends exactly the approved three variables, normalizes Arabic phones, and persists only a hash", async () => {
  const row = await pending();
  assert.equal(await inviteOwnerStaff(row.id, ownerId, "اسم المالك", { database: db, send: sender }), "accepted");
  const message = sent.at(-1)!;
  assert.equal(message.phone, "966551234567");
  assert.equal(message.template, "owner_staff_invite");
  assert.equal(message.language, "ar");
  assert.deepEqual(message.parameters.slice(0, 2), [row.name, "اسم المالك"]);
  assert.equal(message.parameters.length, 3);
  const url = new URL(message.parameters[2]);
  assert.equal(url.origin, "https://takyeh.sa");
  assert.equal(url.pathname, "/activate-staff");
  const token = url.searchParams.get("token")!;
  const result = await db.execute<{ token: string }>(sql`
    SELECT token FROM password_reset_tokens WHERE target_type = ${STAFF_INVITE_TARGET} AND target_id = ${String(row.id)}`);
  assert.equal(result.rows[0].token, hashRecoveryToken(token));
  assert.notEqual(result.rows[0].token, token);
});

it("denies both login routes until activation, then activates once and returns the real username", async () => {
  const row = await pending();
  for (const route of ["/staff/login", "/unified-login"]) {
    const response = await fetch(`${baseUrl}${route}`, { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: row.username, password: "InvitePassword123!" }) });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
  }
  await inviteOwnerStaff(row.id, ownerId, "المالك", { database: db, send: sender });
  const token = new URL(sent.at(-1)!.parameters[2]).searchParams.get("token")!;
  const activation = await reset(token);
  assert.equal(activation.status, 200);
  assert.deepEqual(await activation.json(), { ok: true, activated: true, username: row.username });
  assert.equal((await reset(token)).status, 410);
  const [updated] = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.id, row.id));
  assert(await bcrypt.compare("InvitePassword123!", updated.passwordHash!));
  assert.deepEqual(updated.permissions, row.permissions);
  const login = await fetch(`${baseUrl}/unified-login`, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: row.username, password: "InvitePassword123!" }) });
  assert.equal(login.status, 200);
  assert.match(login.headers.get("set-cookie") || "", /staff_sid=/);
});

it("rejects expired, disabled and already-passworded staff invitations", async () => {
  for (const kind of ["expired", "disabled", "passworded"]) {
    const row = await pending();
    if (kind === "disabled") await db.update(ownerStaffTable).set({ isActive: false }).where(eq(ownerStaffTable.id, row.id));
    if (kind === "passworded") await db.update(ownerStaffTable).set({ passwordHash: await bcrypt.hash("OtherPassword1", 4) }).where(eq(ownerStaffTable.id, row.id));
    const token = await fixtureToken(row.id, new Date(Date.now() + (kind === "expired" ? -1000 : STAFF_INVITE_TTL)));
    assert.equal((await reset(token)).status, 410);
  }
});

it("isolates owners, throttles parallel resends, and replaces old links", async () => {
  const row = await pending();
  assert.equal(await inviteOwnerStaff(row.id, "different-owner", "المالك", { database: db, send: sender }), "not_pending");
  const statuses = await Promise.all([1, 2].map(() => inviteOwnerStaff(row.id, ownerId, "المالك", { database: db, send: sender })));
  assert.deepEqual(statuses.sort(), ["accepted", "cooldown"]);
  const oldToken = new URL(sent.at(-1)!.parameters[2]).searchParams.get("token")!;
  await db.execute(sql`UPDATE password_reset_tokens SET expires_at = ${new Date(Date.now() + STAFF_INVITE_TTL - 120_000)}
    WHERE target_type = ${STAFF_INVITE_TARGET} AND target_id = ${String(row.id)}`);
  assert.equal(await inviteOwnerStaff(row.id, ownerId, "المالك", { database: db, send: sender }), "accepted");
  const newToken = new URL(sent.at(-1)!.parameters[2]).searchParams.get("token")!;
  assert.equal((await reset(oldToken)).status, 410);
  assert.equal((await reset(newToken)).status, 200);
});

it("keeps failed sends pending and revokes the undelivered bearer link", async () => {
  const row = await pending();
  let failedLink = "";
  const status = await inviteOwnerStaff(row.id, ownerId, "المالك", { database: db,
    send: async (_p, _t, parameters) => {
      failedLink = parameters[2];
      throw new Error("provider unavailable");
    } });
  assert.equal(status, "failed");
  assert.equal((await reset(new URL(failedLink).searchParams.get("token")!)).status, 410);
  const [updated] = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.id, row.id));
  assert.equal(updated.passwordHash, null);
});
