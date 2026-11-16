import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID, randomInt } from "node:crypto";
import { after, before, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import { db, pool, ownerStaffTable, ownerSubscriptionsTable, sessionsTable } from "@workspace/db";

const ownerId = `staff-creation-test-${randomUUID()}`;
type SafeStaff = Omit<typeof ownerStaffTable.$inferSelect, "passwordHash">;
let sessionId: string;
let server: Server;
let baseUrl: string;
let applicationId: number;

before(async () => {
  const application = await db.execute<{ id: number }>(sql`
    INSERT INTO owner_applications
      (full_name, business_name, business_type, phone, email, password_hash, status, email_verified, phone_verified, phone_verified_at)
    VALUES ('مالك اختبار دعوة الموظفين', 'نشاط اختبار الدعوة', 'chalet', ${`055${randomInt(1000000, 9999999)}`},
      ${`${ownerId}@example.invalid`}, '', 'approved', true, true, now()) RETURNING id`);
  applicationId = application.rows[0].id;
  await db.execute(sql`INSERT INTO owner_account_links (user_id, owner_application_id) VALUES (${ownerId}, ${applicationId})`);
  await db.insert(ownerSubscriptionsTable).values({
    ownerId, plan: "monthly", status: "active", expiresAt: new Date(Date.now() + 86400000),
  });
  sessionId = await createSession({
    user: { id: ownerId, email: null, firstName: "Synthetic", lastName: "Owner", profileImageUrl: null },
    access_token: "integration-test",
  });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await db.execute(sql`DELETE FROM password_reset_tokens
    WHERE target_type = 'owner_staff_invite' AND target_id IN
      (SELECT CAST(id AS TEXT) FROM owner_staff WHERE owner_id = ${ownerId})`);
  await db.delete(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
  await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
  await db.execute(sql`DELETE FROM owner_account_links WHERE user_id = ${ownerId}`);
  if (applicationId) await db.execute(sql`DELETE FROM owner_applications WHERE id = ${applicationId}`);
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  await pool.end();
});

const valid = { name: "Synthetic Operational Employee", phoneNum: "0500000000", baseSalary: 1500 };
async function createStaff(body: Record<string, unknown>) {
  return fetch(`${baseUrl}/api/owner/staff`, {
    method: "POST",
    headers: { authorization: `Bearer ${sessionId}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

it("requires the full name, mobile and base salary on the server", async () => {
  for (const field of ["name", "phoneNum", "baseSalary"]) {
    const body: Record<string, unknown> = { ...valid };
    delete body[field];
    assert.equal((await createStaff(body)).status, 400, field);
  }
  for (const invalid of [
    { name: "   " }, { phoneNum: "" }, { phoneNum: "123" },
    { baseSalary: -1 }, { baseSalary: "1500" }, { baseSalary: 100_000_000 },
  ]) {
    assert.equal((await createStaff({ ...valid, ...invalid })).status, 400);
  }
});

it("stores operational staff with normalized phone and salary but no credentials or permissions", async () => {
  const response = await createStaff({
    ...valid, name: ` ${valid.name} `, phoneNum: "٠٥٠٠٠٠٠٠٠٠",
    grantAccess: false, username: "ignored-login", password: "MustNeverBecomeUsable",
    permissions: { dashboardAccess: true, financialAccess: true },
  });
  assert.equal(response.status, 201);
  const row = await response.json() as SafeStaff;
  assert.equal(row.name, valid.name);
  assert.equal(row.phoneNum, "0500000000");
  assert.equal(Number(row.baseSalary), 1500);
  assert.equal(row.username, null);
  assert.deepEqual(row.permissions, {});
  assert(!("passwordHash" in row));
  const [stored] = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.id, row.id));
  assert.equal(stored.ownerId, ownerId);
  assert.equal(stored.passwordHash, null);
  const list = await fetch(`${baseUrl}/api/owner/staff`, { headers: { authorization: `Bearer ${sessionId}` } });
  assert.equal(list.status, 200);
  assert((await list.json() as SafeStaff[]).some(staff => staff.id === row.id));
});

it("accepts explicitly entered zero salary and defaults to no platform access", async () => {
  const response = await createStaff({ ...valid, baseSalary: 0 });
  assert.equal(response.status, 201);
  const row = await response.json() as SafeStaff;
  assert.equal(Number(row.baseSalary), 0);
  assert.deepEqual(row.permissions, {});
  assert.equal(row.username, null);
});

it("rejects nonnumeric or overlong mobile and identity inputs even when sent directly", async () => {
  for (const phoneNum of ["05000000000", "5500000000", "+966500000000", "050-000000", "050000000a"]) {
    assert.equal((await createStaff({ ...valid, phoneNum })).status, 400, phoneNum);
  }
  for (const nationalId of ["1", "123456789", "١٢٣٤٥٦٧٨٩", "12345678901", "123abc", "123-456", "١٢٣a"]) {
    assert.equal((await createStaff({ ...valid, nationalId })).status, 400, nationalId);
  }
  assert.equal((await createStaff({ ...valid, email: "not-an-email" })).status, 400);
  assert.equal((await createStaff({ ...valid, jobTitle: "a".repeat(121) })).status, 400);
});

it("employee editing enforces the same digit and length rules without overwriting stored data on failure", async () => {
  const created = await createStaff({ ...valid, nationalId: "1234567890" });
  assert.equal(created.status, 201);
  const employee = await created.json() as SafeStaff;
  const update = (body: Record<string, unknown>) => fetch(`${baseUrl}/api/owner/staff/${employee.id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${sessionId}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  for (const body of [
    { nationalId: "123456789" }, { nationalId: "12345678901" }, { nationalId: "1234a67890" },
    { phoneNum: "051234567" }, { phoneNum: "05123456789" }, { phoneNum: "05123a5678" },
    { phoneNum: "5512345678" }, { phoneNum: "" },
  ]) assert.equal((await update(body)).status, 400, JSON.stringify(body));
  const [unchanged] = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.id, employee.id));
  assert.equal(unchanged.nationalId, "1234567890");
  assert.equal(unchanged.phoneNum, valid.phoneNum);
  const response = await update({ phoneNum: "٠٥١٢٣٤٥٦٧٨", nationalId: "١٢٣٤٥٦٧٨٩٠" });
  assert.equal(response.status, 200);
  const saved = await response.json() as SafeStaff;
  assert.equal(saved.phoneNum, "0512345678");
  assert.equal(saved.nationalId, "1234567890");
  assert.equal((await update({ nationalId: "" })).status, 200);
  const [cleared] = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.id, employee.id));
  assert.equal(cleared.nationalId, null);
  // Unrelated permission/status changes do not need to resubmit personal information.
  assert.equal((await update({ isActive: false })).status, 200);
});

it("persists optional job title and email with normalized identity and retains them on reload", async () => {
  const response = await createStaff({
    ...valid, nationalId: "١٢٣٤٥٦٧٨٩٠",
    jobTitle: " منسق فعاليات ", email: " employee@example.test ",
    birthDate: "1990-01-01", hireDate: "2026-10-01",
  });
  assert.equal(response.status, 201);
  const row = await response.json() as SafeStaff;
  assert.equal(row.jobTitle, "منسق فعاليات");
  assert.equal(row.email, "employee@example.test");
  assert.equal(row.nationalId, "1234567890");
  assert.equal(row.birthDate, "1990-01-01");
  assert.equal(row.hireDate, "2026-10-01");
  const [stored] = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.id, row.id));
  assert.equal(stored.jobTitle, row.jobTitle);
  assert.equal(stored.email, row.email);
  const responseList = await fetch(`${baseUrl}/api/owner/staff`, { headers: { authorization: `Bearer ${sessionId}` } });
  const reloaded = (await responseList.json() as SafeStaff[]).find(staff => staff.id === row.id);
  assert.equal(reloaded?.jobTitle, row.jobTitle);
  assert.equal(reloaded?.email, row.email);
});

it("never creates a partial login account or claims WhatsApp delivery while the provider is unavailable", async () => {
  const original = process.env.TAQNYAT_API_KEY;
  delete process.env.TAQNYAT_API_KEY;
  try {
  const beforeRows = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
  const response = await createStaff({ ...valid, grantAccess: true, permissions: { dashboardAccess: true } });
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { code: string }).code, "staff_invitation_unavailable");
  const afterRows = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
  assert.equal(afterRows.length, beforeRows.length);
  } finally {
    if (original === undefined) delete process.env.TAQNYAT_API_KEY;
    else process.env.TAQNYAT_API_KEY = original;
  }
});

it("creates one pending employee and calls the real provider adapter with the approved three variables", async () => {
  const originalKey = process.env.TAQNYAT_API_KEY;
  const originalFetch = globalThis.fetch;
  const messages: { to: string; template: { name: string; components: { parameters: { text: string }[] }[] } }[] = [];
  process.env.TAQNYAT_API_KEY = "synthetic-test-key-not-a-real-credential";
  globalThis.fetch = async (input, init) => {
    if (String(input) === "https://api.taqnyat.sa/wa/v2/messages/") {
      messages.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ type: "template", statuses: { message_id: "synthetic-only" } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  };
  try {
    const response = await createStaff({ ...valid, phoneNum: "٠٥٥١٢٣٤٥٦٧", grantAccess: true,
      permissions: { dashboardAccess: true, financialAccess: false, unknownPermission: true } });
    assert.equal(response.status, 201);
    const employee = await response.json();
    assert.equal(employee.invitation, "accepted");
    assert.equal(employee.invitationPending, true);
    assert(!("passwordHash" in employee));
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, "966551234567");
    assert.equal(messages[0].template.name, "owner_staff_invite");
    const parameters = messages[0].template.components[0].parameters.map(p => p.text);
    assert.equal(parameters.length, 3);
    assert.deepEqual(parameters.slice(0, 2), [valid.name, "مالك اختبار دعوة الموظفين"]);
    assert.equal(new URL(parameters[2]).searchParams.get("invite"), "staff");
    const [stored] = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.id, employee.id));
    assert.equal(stored.passwordHash, null);
    assert.equal(stored.permissions.dashboardAccess, true);
    assert.equal(stored.permissions.financialAccess, false);
    assert(!("unknownPermission" in stored.permissions));
    const resend = await fetch(`${baseUrl}/api/owner/staff/${employee.id}/invitation`, {
      method: "POST", headers: { authorization: `Bearer ${sessionId}` },
    });
    assert.equal(resend.status, 429);
    assert.equal(messages.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TAQNYAT_API_KEY;
    else process.env.TAQNYAT_API_KEY = originalKey;
  }
});
