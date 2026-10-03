import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import { db, pool, globalSeasonsTable, serviceProvidersTable, serviceSeasonsTable, sessionsTable } from "@workspace/db";

let server: Server;
let baseUrl: string;
let sessionId: string;
let providerId: number;
let otherProviderId: number;
let foreignProviderId: number;
let globalId: number;
let inactiveId: number;
const ownerId = `service-season-test-${randomUUID()}`;
const providers: number[] = [];
const definitions: number[] = [];
let linkedSeasonId: number;
let customSeasonId: number;

async function request(method: string, path: string, body?: object): Promise<{ status: number; json: any }> {
  const response = await fetch(`${baseUrl}/api/providers${path}`, {
    method,
    headers: { Authorization: `Bearer ${sessionId}`, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, json: await response.json() };
}

before(async () => {
  sessionId = await createSession({
    user: { id: ownerId, email: null, firstName: null, lastName: null, profileImageUrl: null },
    access_token: "integration-test",
  });
  for (const id of [ownerId, ownerId, `${ownerId}-foreign`]) {
    const [row] = await db.insert(serviceProvidersTable).values({
      ownerId: id, businessName: "اختبار مواسم معزول", category: "test", city: "الرياض",
      whatsappNumber: "0500000000", galleryPhotos: [], coverageTags: [], customFeatureTags: [],
      photoCaptions: [], isActive: true,
    }).returning();
    providers.push(row.id);
  }
  [providerId, otherProviderId, foreignProviderId] = providers;
  for (const isActive of [true, false]) {
    const [row] = await db.insert(globalSeasonsTable).values({
      nameAr: `موسم اختبار ${randomUUID()}`, startDate: "2030-06-01",
      endDate: "2030-06-10", isActive,
    }).returning();
    definitions.push(row.id);
  }
  [globalId, inactiveId] = definitions;
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (providers.length) await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.id, providers));
  if (definitions.length) await db.delete(globalSeasonsTable).where(inArray(globalSeasonsTable.id, definitions));
  if (sessionId) await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));
  if (server) {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  await pool.end();
});

it("lists only active public definitions and registers server-owned names/dates", async () => {
  const catalog = await request("GET", "/global-seasons");
  assert.equal(catalog.status, 200);
  assert(catalog.json.some((s: any) => s.id === globalId));
  assert(!catalog.json.some((s: any) => s.id === inactiveId));
  const result = await request("POST", `/my/approved/${providerId}/seasons`, {
    globalSeasonId: globalId, name: "اسم مزور", startDate: "2040-01-01", endDate: "2040-01-02", priceLabel: "ملاحظة",
  });
  assert.equal(result.status, 201);
  assert.notEqual(result.json.name, "اسم مزور");
  assert.equal(result.json.startDate, "2030-06-01");
  assert.equal(result.json.globalSeasonId, globalId);
  linkedSeasonId = result.json.id;
});

it("rejects duplicate, inactive and nonexistent public seasons", async () => {
  const path = `/my/approved/${providerId}/seasons`;
  assert.equal((await request("POST", path, { globalSeasonId: globalId })).status, 409);
  assert.equal((await request("POST", path, { globalSeasonId: inactiveId })).status, 422);
  assert.equal((await request("POST", path, { globalSeasonId: 2147483647 })).status, 422);
  assert.equal((await request("POST", `/my/approved/${otherProviderId}/seasons`, { globalSeasonId: globalId })).status, 201);
});

it("preserves current shared definitions and allows notes, not shared date/name edits", async () => {
  await db.update(globalSeasonsTable).set({ nameAr: "اسم محدث للاختبار", endDate: "2030-06-12" })
    .where(eq(globalSeasonsTable.id, globalId));
  const list = await request("GET", `/my/approved/${providerId}/seasons`);
  const linked = list.json.find((s: any) => s.id === linkedSeasonId);
  assert.equal(linked.name, "اسم محدث للاختبار");
  assert.equal(linked.endDate, "2030-06-12");
  const path = `/my/approved/${providerId}/seasons/${linkedSeasonId}`;
  assert.equal((await request("PATCH", path, { name: "تغيير غير مسموح" })).status, 422);
  assert.equal((await request("PATCH", path, { startDate: "2030-06-03" })).status, 422);
  const edited = await request("PATCH", path, { priceLabel: "ملاحظة محدثة" });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.name, "اسم محدث للاختبار");
  assert.equal(edited.json.priceLabel, "ملاحظة محدثة");
  await db.update(globalSeasonsTable).set({ isActive: false }).where(eq(globalSeasonsTable.id, globalId));
  const disabledList = await request("GET", `/my/approved/${providerId}/seasons`);
  assert.equal(disabledList.json.find((s: any) => s.id === linkedSeasonId).isActive, false);
});

it("creates, reloads and edits private seasons with valid date ranges", async () => {
  const path = `/my/approved/${providerId}/seasons`;
  for (const invalid of [
    { name: "   ", startDate: "2030-07-01", endDate: "2030-07-03" },
    { name: "اختبار", startDate: "2030-07-10", endDate: "2030-07-01" },
    { name: "اختبار", startDate: "2030-02-30", endDate: "2030-03-05" },
    { name: "اختبار" },
  ]) assert.equal((await request("POST", path, invalid)).status, 422);
  const created = await request("POST", path, { name: "  موسمي الخاص  ", startDate: "2030-07-01", endDate: "2030-07-03" });
  assert.equal(created.status, 201);
  assert.equal(created.json.name, "موسمي الخاص");
  assert.equal(created.json.globalSeasonId, null);
  customSeasonId = created.json.id;
  assert((await request("GET", path)).json.some((s: any) => s.id === customSeasonId));
  assert.equal((await request("PATCH", `${path}/${customSeasonId}`, { endDate: "2030-06-30" })).status, 422);
  const edited = await request("PATCH", `${path}/${customSeasonId}`, { name: "اسم مخصص معدل", endDate: "2030-07-04" });
  assert.equal(edited.status, 200);
  assert.equal(edited.json.name, "اسم مخصص معدل");
  assert.equal(edited.json.endDate, "2030-07-04");
});

it("scopes all season actions to the selected owned provider and deletes only its association", async () => {
  assert.equal((await request("GET", `/my/approved/${foreignProviderId}/seasons`)).status, 404);
  assert.equal((await request("POST", `/my/approved/${foreignProviderId}/seasons`, { globalSeasonId: globalId })).status, 404);
  assert.equal((await request("PATCH", `/my/approved/${otherProviderId}/seasons/${customSeasonId}`, { name: "غير مسموح" })).status, 404);
  assert.equal((await request("DELETE", `/my/approved/${otherProviderId}/seasons/${customSeasonId}`)).status, 404);
  assert.equal((await request("DELETE", `/my/approved/${providerId}/seasons/${linkedSeasonId}`)).status, 200);
  const [definition] = await db.select().from(globalSeasonsTable).where(eq(globalSeasonsTable.id, globalId));
  assert(definition);
  assert((await request("GET", `/my/approved/${otherProviderId}/seasons`)).json.some((s: any) => s.globalSeasonId === globalId));
  assert.equal((await request("DELETE", `/my/approved/${providerId}/seasons/${customSeasonId}`)).status, 200);
  const remaining = await db.select().from(serviceSeasonsTable).where(eq(serviceSeasonsTable.providerId, providerId));
  assert.equal(remaining.length, 0);
});