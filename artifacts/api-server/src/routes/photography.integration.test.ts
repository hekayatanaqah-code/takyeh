import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import {
  db, pool, photographersTable, photographyPackagesTable, photographyBookingsTable,
  photographyDeliveriesTable, siteSettingsTable, regionsCatalogTable, citiesCatalogTable,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import photographyRouter from "./photography";
import photographyAdminRouter, { photoHash } from "./photography-admin";
import { requireSuperAdmin } from "./admin";
import { reconcilePhotographyBooking } from "../lib/photography-payment";

let server: Server, base: string;
let photographerId = 0, packageId = 0, bookingId = 0;
let regionId = 0, cityId = 0, sessionCookie = "";
const ownerId = `photo-test-${randomUUID()}`, invite = randomBytes(32).toString("hex");
const phone = `96650${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`;
const invoiceId = randomUUID(), paymentId = randomUUID();
let initialEnabled: string | undefined;

async function request<T = Record<string, unknown>>(path: string, body?: object, cookie = sessionCookie, role = "owner") {
  const response = await fetch(`${base}${path}`, {
    method: body ? "POST" : "GET",
    headers: { Origin: base, "Content-Type": "application/json", Cookie: cookie, "X-Test-Role": role },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, data: await response.json() as T, cookie: response.headers.get("set-cookie") };
}
before(async () => {
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  initialEnabled = setting?.value;
  assert.equal(initialEnabled, "false", "Tests must not activate or alter the real feature flag");
  const [region] = await db.select().from(regionsCatalogTable).where(eq(regionsCatalogTable.isActive, true)).limit(1);
  const [city] = await db.select().from(citiesCatalogTable).where(and(eq(citiesCatalogTable.regionId, region.id), eq(citiesCatalogTable.isActive, true))).limit(1);
  regionId = region.id; cityId = city.id;
  const [p] = await db.insert(photographersTable).values({
    name: "مصور اختبار مؤقت", whatsapp: phone, inviteHash: photoHash(invite), inviteExpiresAt: new Date(Date.now() + 3600000),
  }).returning();
  photographerId = p.id;
  const [pack] = await db.insert(photographyPackagesTable).values({ name: "باقة اختبار مؤقتة", priceHalalas: 10000, platformPercent: "20", active: false }).returning();
  packageId = pack.id;
  const app = express();
  app.use(express.json(), cookieParser());
  app.use((req, _res, next) => {
    req.isAuthenticated = (() => req.get("X-Test-Role") !== "anonymous") as typeof req.isAuthenticated;
    req.user = { id: ownerId } as Express.User;
    req.isSuperAdmin = req.get("X-Test-Role") === "superadmin";
    next();
  });
  app.use("/photography", photographyRouter);
  app.use("/admin/photography", requireSuperAdmin, photographyAdminRouter);
  server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  await db.delete(photographyBookingsTable).where(eq(photographyBookingsTable.ownerId, ownerId));
  await db.delete(photographersTable).where(eq(photographersTable.id, photographerId));
  await db.delete(photographyPackagesTable).where(eq(photographyPackagesTable.id, packageId));
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  assert.equal(setting?.value, initialEnabled);
  if (server) await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  await pool.end();
});
test("feature remains disabled and both reservation and checkout are blocked", async () => {
  const status = await request<{ enabled: boolean }>("/photography/status");
  assert.equal(status.data.enabled, false);
  const booking = await request("/photography/bookings", { propertyId: 1, photographerId, packageId, startAt: "2026-12-01T10:00:00Z" });
  assert.equal(booking.status, 423);
  assert.equal((await request("/photography/bookings/1/checkout", { origin: base })).status, 423);
});
test("photography administration is superadmin-only", async () => {
  assert.equal((await request("/admin/photography")).status, 403);
  assert.equal((await request("/admin/photography", undefined, "", "superadmin")).status, 200);
  assert.equal((await request("/photography/bookings", undefined, "", "anonymous")).status, 401);
});
test("invite acceptance consumes token exactly once and issues a private persisted session", async () => {
  assert.equal((await request(`/photography/invites/${invite}`)).status, 200);
  const body = {
    bio: "خبرة تصوير عقارات", regionId, cityId, districtIds: [], allDistricts: true,
    sessionMinutes: 60, availability: [{ weekday: 0, start: "09:00", end: "12:00" }], password: "TestPassword123!",
    experienceYears: "3_5", portfolioUrl: "https://www.behance.net/photo-test", profileImagePath: "",
    whatsapp: "966599999999",
  };
  const accepted = await request<{ photographer: { status: string } }>(`/photography/invites/${invite}`, body, "");
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.photographer.status, "pending");
  const [profile] = await db.select().from(photographersTable).where(eq(photographersTable.id, photographerId));
  assert.equal(profile.experienceYears, "3_5");
  assert.equal(profile.portfolioUrl, body.portfolioUrl);
  assert.equal(profile.whatsapp, phone, "invitation phone stays server-owned even with a tampered payload");
  assert.equal("passwordHash" in accepted.data.photographer, false);
  assert.equal("inviteHash" in accepted.data.photographer, false);
  assert.match(accepted.cookie!, /HttpOnly/);
  sessionCookie = accepted.cookie!.split(";")[0];
  assert.equal((await request(`/photography/invites/${invite}`, body, "")).status, 410);
  assert.equal((await request(`/photography/invites/${invite}`)).status, 410);
  const dashboard = await request<{ photographer: { id: number }; earnings: { netHalalas: number } }>("/photography/portal");
  assert.equal(dashboard.data.photographer.id, photographerId);
  assert.equal(dashboard.data.earnings.netHalalas, 0);
});
test("portal logout invalidates server session; login requires the genuine password", async () => {
  assert.equal((await request("/photography/portal/logout", {})).status, 200);
  assert.equal((await request("/photography/portal")).status, 401);
  assert.equal((await request("/photography/portal/login", { whatsapp: phone, password: "WrongPassword" }, "")).status, 401);
  const login = await request("/photography/portal/login", { whatsapp: phone, password: "TestPassword123!" }, "");
  assert.equal(login.status, 200);
  sessionCookie = login.cookie!.split(";")[0];
  assert.equal((await request("/photography/portal")).status, 200);
});
test("admin approval persists in the same database and is visible in the photographer session", async () => {
  const response = await fetch(`${base}/admin/photography/photographers/${photographerId}`, {
    method: "PATCH",
    headers: { Origin: base, "Content-Type": "application/json", "X-Test-Role": "superadmin" },
    body: JSON.stringify({ status: "approved", regionId, cityId, allDistricts: true, districtIds: [], adminNote: "" }),
  });
  assert.equal(response.status, 200);
  const approved = await response.json() as { status: string; availability: unknown[] };
  assert.equal(approved.status, "approved");
  assert.equal(approved.availability.length, 1);
  const [stored] = await db.select().from(photographersTable).where(eq(photographersTable.id, photographerId));
  assert.equal(stored.status, "approved");
  assert.equal(stored.availability.length, 1);
  const portal = await request<{ photographer: { status: string } }>("/photography/portal");
  assert.equal(portal.data.photographer.status, "approved");
});
test("payment reconciliation rejects wrong amounts and pending payments without notifications", async () => {
  const [row] = await db.insert(photographyBookingsTable).values({
    ownerId, propertyId: 1, photographerId, packageId,
    propertyName: "عقار اختبار", packageName: "باقة اختبار", photographerName: "مصور اختبار",
    ownerPhone: phone, photographerPhone: phone,
    startAt: new Date(Date.now() + 86400000), endAt: new Date(Date.now() + 90000000),
    expiresAt: new Date(Date.now() - 60000), priceHalalas: 10000, commissionHalalas: 2000,
    photographerEarningsHalalas: 8000, invoiceId,
  }).returning();
  bookingId = row.id;
  await assert.rejects(() => reconcilePhotographyBooking(bookingId, {
    fetchInvoice: async () => ({ id: invoiceId, status: "paid", amount: 1, currency: "SAR", url: "" }),
  }), /payment_mismatch/);
  const pending = await reconcilePhotographyBooking(bookingId, {
    fetchInvoice: async () => ({ id: invoiceId, status: "initiated", amount: 10000, currency: "SAR", url: "" }),
  });
  assert.equal(pending.booking.status, "awaiting_payment");
  assert.equal((await db.select().from(photographyDeliveriesTable).where(eq(photographyDeliveriesTable.bookingId, bookingId))).length, 0);
});
test("paid invoice confirms once with frozen commission and deduplicated owner/photographer notices", async () => {
  const provider = async () => ({
    id: invoiceId, status: "paid", amount: 10000, currency: "SAR", url: "",
    payments: [{ id: paymentId, invoice_id: invoiceId, status: "paid", amount: 10000, currency: "SAR", refunded: 0 }],
  });
  const deliver = async (id: number) => {
    await db.update(photographyDeliveriesTable).set({ status: "blocked", error: "test_no_external_send" }).where(eq(photographyDeliveriesTable.id, id));
    return { status: "blocked" };
  };
  await db.update(photographyPackagesTable).set({ priceHalalas: 99900, platformPercent: "90" }).where(eq(photographyPackagesTable.id, packageId));
  const [first, second] = await Promise.all([
    reconcilePhotographyBooking(bookingId, { fetchInvoice: provider, deliverMessage: deliver }),
    reconcilePhotographyBooking(bookingId, { fetchInvoice: provider, deliverMessage: deliver }),
  ]);
  assert.equal(first.booking.status, "confirmed"); assert.equal(second.booking.status, "confirmed");
  assert.equal(first.booking.priceHalalas, 10000); assert.equal(first.booking.commissionHalalas, 2000);
  assert.equal(first.booking.photographerEarningsHalalas, 8000);
  const notices = await db.select().from(photographyDeliveriesTable).where(eq(photographyDeliveriesTable.bookingId, bookingId));
  assert.equal(notices.length, 2);
  assert.equal(notices.every(n => n.status === "blocked"), true);
  const portal = await request<{ bookings: unknown[]; earnings: { netHalalas: number } }>("/photography/portal");
  assert.equal(portal.data.bookings.length, 1);
  assert.equal(portal.data.earnings.netHalalas, 8000);
});
