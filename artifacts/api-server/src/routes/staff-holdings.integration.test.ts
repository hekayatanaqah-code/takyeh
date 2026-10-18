import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { before, after, test } from "node:test";
import express from "express";
import { and, eq } from "drizzle-orm";
import { db, pool, ownerStaffTable, staffHoldingsTable } from "@workspace/db";
import holdingsRouter, { holdingInput, settlementInput } from "./staff-holdings";

const ownerId = `holding-test-${randomUUID()}`;
type HoldingResponse = Pick<typeof staffHoldingsTable.$inferSelect, "id" | "staffId" | "amount" | "recordedOn" | "kind">;
let staffId: number, secondStaffId: number, server: Server, base: string;
before(async () => {
  const rows = await db.insert(ownerStaffTable).values([
    { ownerId, name: "Synthetic holdings employee", baseSalary: "1000" },
    { ownerId, name: "Synthetic other employee", baseSalary: "1000" },
  ]).returning();
  [staffId, secondStaffId] = rows.map(row => row.id);
  const app = express();
  app.use(express.json());
  // Test-only identity injection. Production mounts this router after requireAuth.
  app.use((req, _res, next) => {
    req.user = { id: req.header("x-test-owner") ?? ownerId } as Express.User;
    next();
  });
  app.use("/staff/:staffId/holdings", holdingsRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await db.delete(staffHoldingsTable).where(eq(staffHoldingsTable.ownerId, ownerId));
  await db.delete(ownerStaffTable).where(eq(ownerStaffTable.ownerId, ownerId));
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  await pool.end();
});
function input(extra: Record<string, unknown> = {}) {
  return { kind: "custody", description: "Test custody", amount: 125.75, recordedOn: "2026-10-18", notes: "", requestId: randomUUID(), ...extra };
}
async function request(path = "", body?: unknown, owner = ownerId, employeeId = staffId) {
  return fetch(`${base}/staff/${employeeId}/holdings${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "content-type": "application/json", "x-test-owner": owner },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("validates real dates, precision, positive monetary types and noncash custody", () => {
  assert.equal(holdingInput.safeParse(input({ recordedOn: "2026-02-30" })).success, false);
  assert.equal(holdingInput.safeParse(input({ description: "   " })).success, false);
  assert.equal(holdingInput.safeParse(input({ amount: 1.005 })).success, false);
  assert.equal(holdingInput.safeParse(input({ amount: -1 })).success, false);
  assert.equal(holdingInput.safeParse(input({ amount: 100000000 })).success, false);
  assert.equal(holdingInput.safeParse(input({ kind: "withheld", amount: 0 })).success, false);
  assert.equal(holdingInput.safeParse(input({ kind: "custody", amount: 0 })).success, true);
  assert.equal(settlementInput.safeParse({ settledOn: "2026-10-18", settlementNotes: " " }).success, false);
});

test("persists all four types independently and retries cannot duplicate an entry", async () => {
  for (const kind of ["custody", "withheld", "emergency", "deposit"]) {
    const data = input({ kind });
    const response = await request("", data);
    assert.equal(response.status, 201);
    const saved = await response.json() as HoldingResponse;
    assert.equal(saved.staffId, staffId);
    assert.equal(saved.amount, "125.75");
    assert.equal(saved.recordedOn, data.recordedOn);
    const retry = await request("", data);
    assert.equal(retry.status, 201);
    assert.equal((await retry.json() as HoldingResponse).id, saved.id);
    assert.equal((await request("", { ...data, amount: 600 })).status, 409);
    assert.equal((await request("", data, ownerId, secondStaffId)).status, 409);
  }
  const response = await request();
  assert.equal(response.status, 200);
  const rows = await response.json() as HoldingResponse[];
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map((row: { kind: string }) => row.kind)).size, 4);
});

test("rejects invalid amounts and cross-owner or cross-employee access", async () => {
  assert.equal((await request("", input({ amount: -1 }))).status, 400);
  assert.equal((await request("", input({ recordedOn: "2026-02-30" }))).status, 400);
  assert.equal((await request("", undefined, `${ownerId}-other`)).status, 404);
  assert.equal((await request("", input(), `${ownerId}-other`)).status, 404);
  const [holding] = await db.select().from(staffHoldingsTable).where(eq(staffHoldingsTable.ownerId, ownerId));
  const settlement = { settledOn: "2026-10-19", settlementNotes: "Returned in full" };
  assert.equal((await request(`/${holding.id}/settle`, settlement, `${ownerId}-other`)).status, 404);
  assert.equal((await request(`/${holding.id}/settle`, settlement, ownerId, secondStaffId)).status, 404);
});

test("settlement preserves terms, rejects earlier dates and concurrent duplicate settlements", async () => {
  const data = input({ kind: "deposit", amount: 500 });
  const created = await request("", data);
  const row = await created.json() as HoldingResponse;
  assert.equal((await request(`/${row.id}/settle`, { settledOn: "2026-10-17", settlementNotes: "Before recording" })).status, 400);
  const body = { settledOn: "2026-10-20", settlementNotes: "Returned deposit in full" };
  const results = await Promise.all([request(`/${row.id}/settle`, body), request(`/${row.id}/settle`, body)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const [stored] = await db.select().from(staffHoldingsTable).where(and(
    eq(staffHoldingsTable.ownerId, ownerId), eq(staffHoldingsTable.id, row.id),
  ));
  assert.equal(stored.status, "settled");
  assert.equal(stored.amount, "500.00");
  assert.equal(stored.recordedOn, data.recordedOn);
  assert.equal(stored.settledOn, body.settledOn);
  assert.equal(stored.settlementNotes, body.settlementNotes);
});

test("employee removal cannot cascade away custody and deposit records", async () => {
  await assert.rejects(db.delete(ownerStaffTable).where(eq(ownerStaffTable.id, staffId)));
  const rows = await db.select().from(staffHoldingsTable).where(eq(staffHoldingsTable.staffId, staffId));
  assert.equal(rows.length, 5);
});
