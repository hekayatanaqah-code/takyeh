import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import { eq } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import { db, pool, ownerStaffTable, sessionsTable } from "@workspace/db";

const ownerId = `staff-creation-test-${randomUUID()}`;
type SafeStaff = Omit<typeof ownerStaffTable.$inferSelect, "passwordHash">;
let sessionId: string;
let server: Server;
let baseUrl: string;

before(async () => {
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
  await db.delete(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
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

it("never creates a partial login account or claims WhatsApp delivery while the provider is unavailable", async () => {
  const beforeRows = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
  const response = await createStaff({ ...valid, grantAccess: true, permissions: { dashboardAccess: true } });
  assert.equal(response.status, 503);
  assert.equal((await response.json() as { code: string }).code, "staff_invitation_unavailable");
  const afterRows = await db.select().from(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
  assert.equal(afterRows.length, beforeRows.length);
});
