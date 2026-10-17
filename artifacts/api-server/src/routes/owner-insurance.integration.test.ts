import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, ownerBookingsTable, sessionsTable, pool } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";

const ownerId = `insurance-test-${randomUUID()}`;
const otherOwnerId = `insurance-other-test-${randomUUID()}`;
const sessionIds: string[] = [];
let server: Server;
let baseUrl = "";
let futureId = 0, completedId = 0;
async function request(path: string, body?: object, session = sessionIds[0]) {
  return fetch(`${baseUrl}/api/owner${path}`, {
    method: body ? "PATCH" : "GET",
    headers: { Authorization: `Bearer ${session}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
before(async () => {
  for (const id of [ownerId, otherOwnerId]) {
    sessionIds.push(await createSession({ user: { id, email: `${id}@example.test`, firstName: "اختبار", lastName: "تأمين", profileImageUrl: null }, access_token: "integration-test" }));
  }
  const rows = await db.insert(ownerBookingsTable).values([
    { ownerId, clientName: "تأمين مستقبلي تجريبي", bookingDate: "2999-12-31", durationDays: 1, insuranceFee: "500.00", insuranceReceived: true },
    { ownerId, clientName: "تأمين مكتمل تجريبي", bookingDate: "2020-01-01", durationDays: 1, insuranceFee: "500.00", insuranceReceived: true },
  ]).returning({ id: ownerBookingsTable.id });
  [futureId, completedId] = rows.map(row => row.id);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await db.delete(ownerBookingsTable).where(inArray(ownerBookingsTable.ownerId, [ownerId, otherOwnerId]));
  if (sessionIds.length) await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sessionIds));
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  await pool.end();
});
describe("insurance checkout API guards", () => {
  it("returns receipt flags and authoritative checkout instants only to the owner", async () => {
    const response = await request("/deposits");
    assert.equal(response.status, 200);
    const records = await response.json() as { id: number; insuranceReceived: boolean; checkoutAt: string }[];
    assert.equal(records.length, 2);
    assert(records.every(record => record.insuranceReceived && Number.isFinite(Date.parse(record.checkoutAt))));
    assert.equal(records.find(record => record.id === completedId)?.checkoutAt, "2020-01-01T21:00:00.000Z");
    const other = await request("/deposits", undefined, sessionIds[1]);
    assert.deepEqual(await other.json(), []);
  });
  it("rejects refund and deduction before checkout without changing the booking", async () => {
    for (const patch of [{ insuranceRefunded: true }, { insuranceDeducted: 100, insuranceDeductReason: "سبب", insuranceRefunded: true }]) {
      const response = await request(`/bookings/${futureId}`, patch);
      assert.equal(response.status, 409);
    }
    const [record] = await db.select().from(ownerBookingsTable).where(eq(ownerBookingsTable.id, futureId));
    assert.equal(record.insuranceRefunded, false);
    assert.equal(record.insuranceDeducted, null);
  });
  it("requires a reason and valid deduction after checkout, preserving ownership", async () => {
    assert.equal((await request(`/bookings/${completedId}`, { insuranceDeducted: 50, insuranceRefunded: true })).status, 400);
    assert.equal((await request(`/bookings/${completedId}`, { insuranceDeducted: 600, insuranceDeductReason: "سبب", insuranceRefunded: true })).status, 400);
    assert.equal((await request(`/bookings/${completedId}`, { insuranceRefunded: true }, sessionIds[1])).status, 404);
    assert.equal((await request(`/bookings/${completedId}`, { insuranceDeducted: 100, insuranceDeductReason: "كسر موثق", insuranceRefunded: true })).status, 200);
    const [record] = await db.select().from(ownerBookingsTable).where(eq(ownerBookingsTable.id, completedId));
    assert.equal(Number(record.insuranceDeducted), 100);
    assert.equal(record.insuranceDeductReason, "كسر موثق");
    assert.equal(record.insuranceRefunded, true);
  });
});
