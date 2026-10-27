import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, pool, photographersTable, adminStaffTable, ownerStaffTable, sessionsTable, photographerSessionsTable, adminSessionsTable, staffSessionsTable, usersTable, ownerAccountLinksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import roleRouter from "./role-login";
import { normalizeNumericLoginPassword, normalizeRolePhone } from "../lib/role-login";
import { getSession } from "../lib/auth";

const prefix = `qa-roles-${randomBytes(5).toString("hex")}`;
const phone = `059${randomInt(1000000, 9999999)}`;
const email = `${prefix}@example.invalid`;
const ownerPassword = "TestOwner2026!", photoPassword = "TestPhoto2026!", adminPassword = "TestAdmin2026!";
let server: Server, origin: string, ownerId = 0, photoId = 0, adminId = 0, staffId = 0;
let initialFlag: string | undefined;
const tokens: string[] = [];
async function request(path: string, body: unknown, cookie = "") {
  const r = await fetch(`${origin}${path}`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie },
    body: JSON.stringify(body),
  });
  const cookies = r.headers.getSetCookie();
  for (const c of cookies) {
    const token = c.split(";")[0].split("=")[1];
    if (/^[a-f0-9]{64}$/.test(token)) tokens.push(token);
  }
  return { status: r.status, data: await r.json() as { requiresRole?: boolean; redirect?: string; error?: string; roles: { role: string; requiresPassword: boolean }[] }, cookies };
}
const challengeCookie = (r: Awaited<ReturnType<typeof request>>) => r.cookies.find(c => c.startsWith("role_login_challenge=") && !c.startsWith("role_login_challenge=;"))!.split(";")[0];
before(async () => {
  const flag = await db.execute(sql`SELECT value FROM site_settings WHERE key='photography_enabled'`);
  initialFlag = (flag as any).rows[0]?.value;
  const ownerHash = await bcrypt.hash(ownerPassword, 4);
  const photoHash = await bcrypt.hash(photoPassword, 4);
  const adminHash = await bcrypt.hash(adminPassword, 4);
  const owner = await db.execute(sql`INSERT INTO owner_applications(full_name,business_name,business_type,phone,email,password_hash,status,email_verified)
    VALUES(${prefix},${prefix},'chalet',${phone},${email},${ownerHash},'approved',true) RETURNING id`);
  ownerId = (owner as any).rows[0].id;
  const [photo] = await db.insert(photographersTable).values({ name: prefix, whatsapp: `966${phone.slice(1)}`, email, passwordHash: photoHash, status: "approved" }).returning();
  photoId = photo.id;
  const [admin] = await db.insert(adminStaffTable).values({ name: prefix, username: `${prefix}-admin`, mobile: phone, personalEmail: email, passwordHash: adminHash, permissions: {}, isSuperAdmin: false }).returning();
  adminId = admin.id;
  const [staff] = await db.insert(ownerStaffTable).values({ ownerId: `owner_${ownerId}`, name: prefix, username: `${prefix}-staff`, phoneNum: phone, email, passwordHash: ownerHash, baseSalary: "0", permissions: {} }).returning();
  staffId = staff.id;
  const app = express();
  app.use(express.json(), cookieParser(), roleRouter);
  server = await new Promise<Server>(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  for (const token of tokens) await db.delete(sessionsTable).where(eq(sessionsTable.sid, token));
  if (photoId) {
    await db.delete(photographerSessionsTable).where(eq(photographerSessionsTable.photographerId, photoId));
    await db.delete(photographersTable).where(eq(photographersTable.id, photoId));
  }
  if (adminId) { await db.delete(adminSessionsTable).where(eq(adminSessionsTable.adminStaffId, adminId)); await db.delete(adminStaffTable).where(eq(adminStaffTable.id, adminId)); }
  if (staffId) { await db.delete(staffSessionsTable).where(eq(staffSessionsTable.staffId, staffId)); await db.delete(ownerStaffTable).where(eq(ownerStaffTable.id, staffId)); }
  await db.delete(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, `${prefix}-linked`));
  await db.delete(usersTable).where(eq(usersTable.id, `${prefix}-linked`));
  if (ownerId) await db.execute(sql`DELETE FROM owner_applications WHERE id=${ownerId} AND full_name=${prefix}`);
  const flag = await db.execute(sql`SELECT value FROM site_settings WHERE key='photography_enabled'`);
  assert.equal((flag as any).rows[0]?.value, initialFlag);
  await pool.end();
});
test("Saudi identifiers normalize both Arabic digit sets", () => {
  for (const p of ["٠٥٩١٢٣٤٥٦٧", "۰۵۹۱۲۳۴۵۶۷", "+966 59 123 4567", "00966591234567"]) assert.equal(normalizeRolePhone(p), "591234567");
  assert.equal(normalizeRolePhone("name@example.invalid"), "");
});
test("only purely numeric passwords normalize without trimming or altering mixed passwords", () => {
  assert.equal(normalizeNumericLoginPassword("١٢٣٤٥٦٧٨٩"), "123456789");
  assert.equal(normalizeNumericLoginPassword("۱۲۳۴۵۶۷۸۹"), "123456789");
  assert.equal(normalizeNumericLoginPassword("1٢3٤5٦7٨9"), "123456789");
  for (const exact of ["Pass١٢٣!", " ١٢٣٤٥٦٧٨٩", "١٢٣٤٥٦٧٨٩ ", "١٢٣-٤٥٦"]) {
    assert.equal(normalizeNumericLoginPassword(exact), exact);
  }
});
test("numeric owner credentials accept English, Eastern and mixed digits but reject a different password", async () => {
  const numericPassword = String(randomInt(100000000, 999999999));
  const numericPhone = `058${randomInt(1000000, 9999999)}`;
  const eastern = (value: string) => value.replace(/[0-9]/g, d => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const hash = await bcrypt.hash(numericPassword, 4);
  const inserted = await db.execute(sql`INSERT INTO owner_applications(full_name,business_name,business_type,phone,email,password_hash,status,email_verified)
    VALUES(${prefix},${prefix},'chalet',${numericPhone},${`${prefix}-numeric@example.invalid`},${hash},'approved',true) RETURNING id`);
  const id = Number(inserted.rows[0].id);
  try {
    for (const identifier of [numericPhone, eastern(numericPhone)]) {
      for (const password of [numericPassword, eastern(numericPassword)]) {
        const response = await request("/auth/role-login", { identifier, password });
        assert.equal(response.status, 200);
        assert.equal(response.data.redirect, "/dashboard");
        const sessionCookie = response.cookies.find(c => c.startsWith("sid="))!;
        assert.equal((await getSession(sessionCookie.split(";")[0].slice(4)))?.ownerApplicationId, id);
      }
    }
    const bad = numericPassword.slice(0, -1) + ((Number(numericPassword.at(-1)) + 1) % 10);
    assert.equal((await request("/auth/role-login", { identifier: numericPhone, password: bad })).status, 401);
    assert.equal((await request("/auth/role-login", { identifier: numericPhone, password: `${numericPassword} ` })).status, 401);
  } finally {
    await db.execute(sql`DELETE FROM sessions WHERE sess->>'ownerApplicationId'=${String(id)}`);
    await db.execute(sql`DELETE FROM owner_applications WHERE id=${id} AND full_name=${prefix}`);
  }
});
test("shared phone and email reveal all roles only after valid credentials", async () => {
  assert.equal((await request("/auth/role-login", { identifier: phone, password: "wrong" })).status, 401);
  for (const identifier of [phone, `966${phone.slice(1)}`, email.toUpperCase()]) {
    const r = await request("/auth/role-login", { identifier, password: ownerPassword });
    assert.equal(r.status, 200);
    assert.equal(r.data.requiresRole, true);
    assert.deepEqual(new Set(r.data.roles.map((x: any) => x.role)), new Set(["owner", "photographer", "admin", "staff"]));
    assert.equal(r.cookies.some(c => /^(sid|photographer_session|admin_staff_sid|staff_sid)=/.test(c)), false);
    assert.equal(r.data.roles.find(x => x.role === "photographer")?.requiresPassword, true);
  }
});
test("only the selected verified role gets a session; challenges are one-use", async () => {
  const r = await request("/auth/role-login", { identifier: email, password: ownerPassword });
  const cookie = challengeCookie(r), key = `owner:${ownerId}`;
  const selected = await request("/auth/select-role", { key }, cookie);
  assert.equal(selected.status, 200);
  const ownerCookie = selected.cookies.find(c => c.startsWith("sid="))!;
  const data = await getSession(ownerCookie.split(";")[0].slice(4));
  assert.equal(data?.ownerApplicationId, ownerId);
  assert.equal(data?.user.id, `owner_${ownerId}`);
  assert.equal((await request("/auth/select-role", { key }, cookie)).status, 401);
});
test("another role cannot use the first role's password or a forged identity", async () => {
  const r = await request("/auth/role-login", { identifier: phone, password: ownerPassword });
  const cookie = challengeCookie(r);
  const bad = await request("/auth/select-role", { key: `photographer:${photoId}`, password: ownerPassword }, cookie);
  assert.equal(bad.status, 401);
  assert.equal(bad.data.error, "كلمة المرور الخاصة بالدور المختار غير صحيحة");
  assert.equal(bad.cookies.some(c => c.startsWith("photographer_session=")), false);
  const good = await request("/auth/select-role", { key: `photographer:${photoId}`, password: photoPassword }, cookie);
  assert.equal(good.status, 200);
  const photoCookie = good.cookies.find(c => c.startsWith("photographer_session=") && !c.startsWith("photographer_session=;"))!;
  assert.match(photoCookie, /Path=\/api\/photography/);
  assert.match(photoCookie, /HttpOnly/);
  assert.equal(good.cookies.some(c => /^(sid|admin_staff_sid|staff_sid)=/.test(c)), false);
  const forged = await request("/auth/role-login", { identifier: phone, password: ownerPassword });
  assert.equal((await request("/auth/select-role", { key: "admin:2147483647" }, challengeCookie(forged))).status, 401);
});
test("admin password is verified separately and inactive accounts invalidate choices", async () => {
  const r = await request("/auth/role-login", { identifier: email, password: photoPassword });
  const cookie = challengeCookie(r), key = `admin:${adminId}`;
  assert.equal((await request("/auth/select-role", { key, password: photoPassword }, cookie)).status, 401);
  assert.equal((await request("/auth/select-role", { key, password: adminPassword }, cookie)).data.redirect, "/admin");
  const revoked = await request("/auth/role-login", { identifier: email, password: adminPassword });
  await db.update(adminStaffTable).set({ isActive: false }).where(eq(adminStaffTable.id, adminId));
  assert.equal((await request("/auth/select-role", { key }, challengeCookie(revoked))).status, 401);
  await db.update(adminStaffTable).set({ isActive: true }).where(eq(adminStaffTable.id, adminId));
});
test("expired choices and password changes fail closed", async () => {
  const r = await request("/auth/role-login", { identifier: phone, password: ownerPassword });
  const cookie = challengeCookie(r), token = cookie.split("=")[1];
  await db.update(sessionsTable).set({ expire: new Date(0) }).where(eq(sessionsTable.sid, token));
  assert.equal((await request("/auth/select-role", { key: `owner:${ownerId}` }, cookie)).status, 401);
  const changed = await request("/auth/role-login", { identifier: phone, password: photoPassword });
  const hash = await bcrypt.hash(photoPassword, 4);
  await db.update(photographersTable).set({ passwordHash: hash }).where(eq(photographersTable.id, photoId));
  assert.equal((await request("/auth/select-role", { key: `photographer:${photoId}` }, challengeCookie(changed))).status, 401);
});
test("single-role usernames retain direct login without a modal", async () => {
  const r = await request("/auth/role-login", { identifier: `${prefix}-admin`, password: adminPassword });
  assert.equal(r.status, 200);
  assert.equal(r.data.requiresRole, undefined);
  assert.equal(r.data.redirect, "/admin");
});
test("legacy owner login also requires explicit selection for shared contacts", async () => {
  const r = await request("/owner-login", { identifier: phone, password: ownerPassword });
  assert.equal(r.status, 200);
  assert.equal(r.data.requiresRole, true);
});
test("durable owner identity survives role selection and remember-me persists in DB", async () => {
  const linkedId = `${prefix}-linked`;
  await db.insert(usersTable).values({ id: linkedId, email: `${prefix}-linked@example.invalid` });
  await db.insert(ownerAccountLinksTable).values({ userId: linkedId, ownerApplicationId: ownerId });
  const r = await request("/auth/role-login", { identifier: phone, password: ownerPassword, rememberMe: true });
  const selected = await request("/auth/select-role", { key: `owner:${ownerId}` }, challengeCookie(r));
  assert.equal(selected.status, 200);
  const cookie = selected.cookies.find(c => c.startsWith("sid="))!;
  const token = cookie.split(";")[0].slice(4);
  assert.equal((await getSession(token))?.user.id, linkedId);
  const [row] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, token));
  assert.ok(+row.expire - Date.now() > 29 * 86400000);
});
