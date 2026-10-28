import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { db, pool, ownerSubscriptionsTable, serviceProvidersTable, sessionsTable, quickSalesTable, quickSalesSettingsTable, providerCatalogItemsTable } from "@workspace/db";
import app from "../app";
import { createSession } from "../lib/auth";

const ownerId = `quick-sales-test-${randomUUID()}`;
const otherId = `quick-sales-other-${randomUUID()}`;
const providerIds: number[] = [];
let sid: string;
let server: Server;
let base: string;
const payload = () => ({
  providerId: providerIds[0], dateStr: "2026-10-28", clientName: "عميل اختباري",
  items: [{ name: "منتج اختباري", quantity: 3, unitPrice: 10.15 }],
  paymentMethod: "cash", idempotencyKey: randomUUID(),
});
async function request(path: string, method = "GET", body?: object, auth = true) {
  const response = await fetch(`${base}/api/owner/quick-sales${path}`, {
    method, headers: { ...(auth ? { authorization: `Bearer ${sid}` } : {}), "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, json: await response.json() as any };
}
before(async () => {
  sid = await createSession({ user: { id: ownerId, email: `${ownerId}@example.test`, firstName: "اختبار", lastName: "مبيعات", profileImageUrl: null }, access_token: "" });
  for (const [index, owner] of [ownerId, ownerId, otherId].entries()) {
    const [provider] = await db.insert(serviceProvidersTable).values({
      ownerId: owner, businessName: `اختبار بيع ${index}`, category: "cake", city: "بريدة", whatsappNumber: "0500000000",
    }).returning();
    providerIds.push(provider.id);
  }
  await db.insert(ownerSubscriptionsTable).values({ ownerId, status: "active", expiresAt: new Date(Date.now() + 86400000) });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  await db.delete(quickSalesTable).where(eq(quickSalesTable.ownerId, ownerId));
  await db.delete(quickSalesSettingsTable).where(eq(quickSalesSettingsTable.ownerId, ownerId));
  if (providerIds.length) await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.id, providerIds));
  await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, ownerId));
  if (sid) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});
it("requires authentication, defaults off and persists account-wide opt-in", async () => {
  assert.equal((await request("", "GET", undefined, false)).status, 401);
  assert.deepEqual((await request("/settings")).json, { enabled: false });
  assert.equal((await request("", "POST", payload())).status, 403);
  assert.equal((await request("/settings", "PATCH", { enabled: "true" })).status, 400);
  assert.deepEqual((await request("/settings", "PATCH", { enabled: true })).json, { enabled: true });
});
it("records exact cents, protects idempotent retries and provider isolation", async () => {
  const sale = payload();
  const [first, retry] = await Promise.all([request("", "POST", sale), request("", "POST", sale)]);
  assert.equal(first.status, 201);
  assert.equal(retry.status, 201);
  assert.equal(first.json.id, retry.json.id);
  assert.equal(first.json.total, 30.45);
  assert.equal(first.json.status, "completed");
  assert.equal((await request("", "POST", { ...sale, notes: "changed" })).status, 409);
  assert.equal((await request("", "POST", { ...payload(), providerId: providerIds[2] })).status, 404);
  assert.equal((await request(`?providerId=${providerIds[2]}`)).status, 404);
  assert.equal((await request(`?providerId=${providerIds[1]}`)).json.length, 0);
  assert.equal((await request(`?providerId=${providerIds[0]}`)).json.length, 1);
});
it("rejects invalid dates, blank names, fractional quantities, excess precision and other-provider products", async () => {
  for (const patch of [
    { dateStr: "2026-02-30" },
    { items: [{ name: " ", quantity: 1, unitPrice: 5 }] },
    { items: [{ name: "x", quantity: 1.5, unitPrice: 5 }] },
    { items: [{ name: "x", quantity: 1, unitPrice: 1.005 }] },
    { items: [{ name: "x", quantity: 1, unitPrice: 0 }] },
  ]) assert.equal((await request("", "POST", { ...payload(), ...patch })).status, 400);
  const [item] = await db.insert(providerCatalogItemsTable).values({
    providerId: providerIds[1], name: "منتج مستقل", kind: "product", price: "50", pricingUnit: "per_piece",
  }).returning();
  assert.equal((await request("", "POST", {
    ...payload(), items: [{ catalogItemId: item.id, name: "x", quantity: 1, unitPrice: 50 }],
  })).status, 404);
});
it("disable blocks new sales without hiding history; cancellation is retained and once-only", async () => {
  const sale = payload();
  const created = await request("", "POST", sale);
  assert.equal(created.status, 201);
  await request("/settings", "PATCH", { enabled: false });
  assert.equal((await request("", "POST", payload())).status, 403);
  assert.equal((await request("", "POST", sale)).json.id, created.json.id);
  assert.ok((await request("")).json.some((row: any) => row.id === created.json.id));
  assert.equal((await request(`/${created.json.id}/cancel`, "POST", { reason: " " })).status, 400);
  const cancelled = await request(`/${created.json.id}/cancel`, "POST", { reason: "تصحيح عملية اختبارية" });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.status, "cancelled");
  assert.ok(cancelled.json.cancelledAt);
  assert.equal((await request(`/${created.json.id}/cancel`, "POST", { reason: "تصحيح مكرر" })).status, 409);
  assert.equal((await request(`/${created.json.id + 999999}/cancel`, "POST", { reason: "عملية أخرى" })).status, 404);
});
