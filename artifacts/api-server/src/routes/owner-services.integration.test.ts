import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import { db, pool, ownerServicesTable, photographersTable, siteSettingsTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import ownerServicesRouter from "./owner-services";
import ownerServicesAdminRouter from "./owner-services-admin";
import photographyAdminRouter from "./photography-admin";
import photographyRouter from "./photography";
import { requireSuperAdmin } from "./admin";
import { safeServiceUrl } from "../lib/owner-services";
import { photographyReadiness } from "../lib/photography-delivery";

let server: Server, base: string;
const fixtureIds: number[] = [];
let photographerId = 0;
const token = randomUUID();
let baseline: { id: number; sortOrder: number }[] = [];
let reorderedBaseline = false;
type Card = { id: number; title: string; state: string; sortOrder: number; actionUrl: string | null };
async function request(path: string, method = "GET", body?: object, role = "superadmin") {
  const response = await fetch(`${base}${path}`, {
    method, headers: { Origin: base, "Content-Type": "application/json", "X-Test-Role": role },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() as Record<string, any> };
}
before(async () => {
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  assert.equal(setting?.value, "false", "Never enable the live service for regression tests");
  const app = express();
  app.use(express.json(), cookieParser());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => req.get("X-Test-Role") !== "anonymous") as typeof req.isAuthenticated;
    req.user = { id: `owner-services-test-${token}` } as Express.User;
    req.isSuperAdmin = req.get("X-Test-Role") === "superadmin";
    next();
  });
  app.use("/owner-services", ownerServicesRouter);
  app.use("/admin/owner-services", requireSuperAdmin, ownerServicesAdminRouter);
  app.use("/admin/photography", requireSuperAdmin, photographyAdminRouter);
  app.use("/photography", photographyRouter);
  server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const current = await request("/admin/owner-services");
  baseline = current.data.services.map((c: Card) => ({ id: c.id, sortOrder: c.sortOrder }));
});
after(async () => {
  // Only restore rows actually changed by the reorder test, and only if no
  // intervening administrator has changed the value we wrote.
  for (const [index, original] of baseline.entries()) if (reorderedBaseline && original.sortOrder !== index) {
    await db.execute(
      (await import("drizzle-orm")).sql`UPDATE owner_services SET sort_order = ${original.sortOrder} WHERE id = ${original.id} AND sort_order = ${index}`,
    );
  }
  if (fixtureIds.length) await db.delete(ownerServicesTable).where(inArray(ownerServicesTable.id, fixtureIds));
  if (photographerId) await db.delete(photographersTable).where(eq(photographersTable.id, photographerId));
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  assert.equal(setting?.value, "false");
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await pool.end();
});
test("request links reject unsafe schemes, cross-origin slash tricks and embedded credentials", () => {
  for (const url of ["javascript:alert(1)", "http://example.com", "//evil.com", "/\\evil.com", "https://user:password@example.com", "/bad\npath"]) assert.equal(safeServiceUrl(url), false);
  assert.equal(safeServiceUrl("/dashboard?view=account"), true);
  assert.equal(safeServiceUrl("https://example.com/request"), true);
});
test("card manager requires superadmin; owner catalog requires authentication", async () => {
  for (const [path, method, body] of [
    ["/admin/owner-services", "GET", undefined],
    ["/admin/owner-services", "POST", { title: "ممنوع" }],
    ["/admin/owner-services/1", "PATCH", { state: "hidden" }],
    ["/admin/owner-services/1", "DELETE", undefined],
    ["/admin/owner-services/order", "PUT", { ids: [] }],
  ] as const) assert.equal((await request(path, method, body, "owner")).status, 403);
  assert.equal((await request("/owner-services", "GET", undefined, "anonymous")).status, 401);
  assert.equal((await request("/owner-services", "GET", undefined, "owner")).status, 200);
});
test("create cards dynamically and reject invalid future-service activation", async () => {
  for (const suffix of ["A", "B"]) {
    const created = await request("/admin/owner-services", "POST", { title: `TEST-card-${token}-${suffix}`, description: "خدمة اختبار مؤقتة", kind: "link", state: "coming_soon", icon: "wrench", actionUrl: null });
    assert.equal(created.status, 201);
    fixtureIds.push(created.data.id);
  }
  const result = await request(`/admin/owner-services/${fixtureIds[0]}`, "PATCH", { state: "available" });
  assert.equal(result.status, 409);
  assert.equal((await request(`/admin/owner-services/${fixtureIds[0]}`, "PATCH", { kind: "photography" })).status, 400);
  assert.equal((await request(`/admin/owner-services/${fixtureIds[0]}`, "PATCH", { actionUrl: "javascript:alert(1)" })).status, 400);
});
test("three-state transitions and metadata edits propagate to owner catalog", async () => {
  const id = fixtureIds[0];
  const changed = await request(`/admin/owner-services/${id}`, "PATCH", { title: `TEST-edited-${token}`, state: "available", actionUrl: "/dashboard?view=account" });
  assert.equal(changed.status, 200);
  let owner = await request("/owner-services", "GET", undefined, "owner");
  assert.equal(owner.data.services.find((c: Card) => c.id === id).title, `TEST-edited-${token}`);
  assert.equal(owner.data.services.find((c: Card) => c.id === id).state, "available");
  assert.equal((await request(`/admin/owner-services/${id}`, "PATCH", { state: "hidden" })).status, 200);
  owner = await request("/owner-services", "GET", undefined, "owner");
  assert.equal(owner.data.services.some((c: Card) => c.id === id), false);
  await request(`/admin/owner-services/${id}`, "PATCH", { state: "coming_soon" });
  owner = await request("/owner-services", "GET", undefined, "owner");
  assert.equal(owner.data.services.find((c: Card) => c.id === id).state, "coming_soon");
});
test("ordering is complete, unique and persisted; partial ordering cannot corrupt cards", async () => {
  assert.equal((await request("/admin/owner-services/order", "PUT", { ids: [fixtureIds[0], fixtureIds[0]] })).status, 409);
  assert.equal((await request("/admin/owner-services/order", "PUT", { ids: fixtureIds })).status, 409);
  const ids = [...baseline.map(c => c.id), fixtureIds[1], fixtureIds[0]];
  const reordered = await request("/admin/owner-services/order", "PUT", { ids });
  reorderedBaseline = reordered.status === 200;
  assert.equal(reordered.status, 200);
  assert.deepEqual(reordered.data.services.map((c: Card) => c.id), ids);
  const owner = await request("/owner-services", "GET", undefined, "owner");
  assert.deepEqual(owner.data.services.filter((c: Card) => fixtureIds.includes(c.id)).map((c: Card) => c.id), [fixtureIds[1], fixtureIds[0]]);
});
test("photography card and legacy toggle cannot bypass provider-readiness guards", async () => {
  const admin = await request("/admin/owner-services");
  const photo = admin.data.services.find((c: { kind: string }) => c.kind === "photography");
  assert.ok(photo);
  assert.equal(photo.state, "coming_soon");
  if (!photographyReadiness().whatsapp || !photographyReadiness().payment) {
    assert.equal((await request(`/admin/owner-services/${photo.id}`, "PATCH", { state: "available" })).status, 409);
    assert.equal((await request("/admin/photography/settings", "PATCH", { enabled: true })).status, 409);
  }
  assert.equal((await request("/photography/status")).data.enabled, false);
  assert.equal((await request("/photography/bookings", "POST", { propertyId: 1, photographerId: 1, packageId: 1, startAt: "2026-12-01T10:00:00Z" }, "owner")).status, 423);
});
test("photographer details and weekly calendar can be edited with overlap validation", async () => {
  const [fixture] = await db.insert(photographersTable).values({ name: `TEST-profile-${token}`, whatsapp: `test-${token}` }).returning();
  photographerId = fixture.id;
  const invalid = await request(`/admin/photography/photographers/${photographerId}/profile`, "PATCH", { availability: [{ weekday: 1, start: "10:00", end: "12:00" }, { weekday: 1, start: "11:00", end: "13:00" }] });
  assert.equal(invalid.status, 400);
  const updated = await request(`/admin/photography/photographers/${photographerId}/profile`, "PATCH", { name: `TEST-updated-${token}`, bio: "تعديل مؤقت", sessionMinutes: 90, availability: [{ weekday: 1, start: "09:00", end: "12:00" }] });
  assert.equal(updated.status, 200);
  assert.equal("passwordHash" in updated.data, false);
  const [row] = await db.select().from(photographersTable).where(eq(photographersTable.id, photographerId));
  assert.equal(row.sessionMinutes, 90);
  assert.deepEqual(row.availability, [{ weekday: 1, start: "09:00", end: "12:00" }]);
});
test("removal hides only the chosen card and preserves archived metadata", async () => {
  const id = fixtureIds[0];
  assert.equal((await request(`/admin/owner-services/${id}`, "DELETE")).status, 200);
  assert.equal((await request("/admin/owner-services")).data.services.some((c: Card) => c.id === id), false);
  assert.equal((await request("/owner-services", "GET", undefined, "owner")).data.services.some((c: Card) => c.id === id), false);
  const [archived] = await db.select().from(ownerServicesTable).where(eq(ownerServicesTable.id, id));
  assert.ok(archived.deletedAt);
  assert.equal(archived.state, "hidden");
  assert.equal((await request(`/admin/owner-services/${id}`, "PATCH", { title: "محذوف" })).status, 404);
});
