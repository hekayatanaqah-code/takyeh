import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import {
  db, pool, photographersTable, photographyPackagesTable, photographyBookingsTable,
  photographyDeliveriesTable, siteSettingsTable, regionsCatalogTable, citiesCatalogTable,
  photographyContractsTable, photographyTransfersTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import photographyRouter from "./photography";
import photographyAdminRouter, { photoHash } from "./photography-admin";
import { requireSuperAdmin } from "./admin";
import { reconcilePhotographyBooking } from "../lib/photography-payment";
import registrationRouter from "./registration";
import { currentPhotographyContract } from "../lib/photography-finance";

let server: Server, base: string;
let photographerId = 0, packageId = 0, bookingId = 0;
let regionId = 0, cityId = 0, sessionCookie = "";
const ownerId = `photo-test-${randomUUID()}`, invite = randomBytes(32).toString("hex");
const phone = `96650${String(Math.floor(Math.random() * 10000000)).padStart(7, "0")}`;
const invoiceId = randomUUID(), paymentId = randomUUID();
let initialEnabled: string | undefined;
let contractId = 0;
const temporaryContracts: number[] = [];

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
  const current = await currentPhotographyContract();
  if (current) contractId = current.id;
  else {
    const [contract] = await db.insert(photographyContractsTable).values({ html: "<p>عقد اختبار مؤقت، ليس للاستخدام الفعلي</p>" }).returning();
    contractId = contract.id; temporaryContracts.push(contract.id);
  }
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
  app.use("/accounts", registrationRouter);
  app.use("/admin/photography", requireSuperAdmin, photographyAdminRouter);
  server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  await db.execute(sql`DELETE FROM owner_support_requests WHERE owner_id = ${`photographer_${photographerId}`}`);
  await db.delete(photographyTransfersTable).where(eq(photographyTransfersTable.photographerId, photographerId));
  await db.delete(photographyBookingsTable).where(eq(photographyBookingsTable.ownerId, ownerId));
  await db.delete(photographersTable).where(eq(photographersTable.id, photographerId));
  await db.delete(photographyPackagesTable).where(eq(photographyPackagesTable.id, packageId));
  for (const id of temporaryContracts) await db.execute(sql`DELETE FROM photography_contracts WHERE id = ${id}
    AND NOT EXISTS (SELECT 1 FROM photographers WHERE contract_version = ${id})`);
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
    iban: "SA0380000000608010167519", bankName: "الراجحي", contractAccepted: true, contractVersion: contractId,
  };
  assert.equal((await request(`/photography/invites/${invite}`, { ...body, contractAccepted: false }, "")).status, 400);
  assert.equal((await request(`/photography/invites/${invite}`, { ...body, iban: "SA0380000000608010167518" }, "")).status, 400);
  assert.equal((await request(`/photography/invites/${invite}`, { ...body, contractVersion: 2147483647 }, "")).status, 409);
  const accepted = await request<{ photographer: { status: string } }>(`/photography/invites/${invite}`, body, "");
  assert.equal(accepted.status, 200);
  assert.equal(accepted.data.photographer.status, "pending");
  const [profile] = await db.select().from(photographersTable).where(eq(photographersTable.id, photographerId));
  assert.equal(profile.experienceYears, "3_5");
  assert.equal(profile.portfolioUrl, body.portfolioUrl);
  assert.equal(profile.whatsapp, phone, "invitation phone stays server-owned even with a tampered payload");
  assert.equal(profile.iban, body.iban);
  assert.equal(profile.contractVersion, contractId);
  assert.ok(profile.contractAcceptedAt);
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
test("portal persists, clears and validates blocked dates and supports a fully closed week", async () => {
  const profile = {
    bio: "مصور عقارات", regionId, cityId, districtIds: [], allDistricts: true,
    sessionMinutes: 180, availability: [], blockedDates: ["2026-12-01", "2026-12-01"],
  };
  const patch = async (body: object) => fetch(`${base}/photography/portal`, {
    method: "PATCH", headers: { Origin: base, "Content-Type": "application/json", Cookie: sessionCookie },
    body: JSON.stringify(body),
  });
  let response = await patch(profile);
  assert.equal(response.status, 200);
  let portal = await request<{ photographer: { blockedDates: string[]; sessionMinutes: number; availability: unknown[] } }>("/photography/portal");
  assert.deepEqual(portal.data.photographer.blockedDates, ["2026-12-01"]);
  assert.equal(portal.data.photographer.sessionMinutes, 180);
  assert.deepEqual(portal.data.photographer.availability, []);
  response = await patch({ ...profile, blockedDates: ["2026-02-30"] });
  assert.equal(response.status, 400);
  response = await patch({ ...profile, blockedDates: [], availability: [{ weekday: 0, start: "09:00", end: "12:00" }] });
  assert.equal(response.status, 200);
  portal = await request("/photography/portal");
  assert.deepEqual(portal.data.photographer.blockedDates, []);
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
  assert.equal((await request("/photography/events", undefined, "")).status, 401);
  const controller = new AbortController();
  const streamTimeout = setTimeout(() => controller.abort(), 10000);
  streamTimeout.unref();
  const stream = await fetch(`${base}/photography/events`, { headers: { Cookie: sessionCookie }, signal: controller.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("content-type")!, /text\/event-stream/);
  const reader = stream.body!.getReader();
  await reader.read();
  const bookingEvent = reader.read();
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
  const { value } = await bookingEvent;
  assert.match(new TextDecoder().decode(value), /event: booking-confirmed/);
  assert.match(new TextDecoder().decode(value), new RegExp(`"bookingId":${bookingId}`));
  controller.abort();
  clearTimeout(streamTimeout);
  await reader.cancel().catch(() => {});
  assert.equal(first.booking.status, "confirmed"); assert.equal(second.booking.status, "confirmed");
  assert.equal(first.booking.priceHalalas, 10000); assert.equal(first.booking.commissionHalalas, 2000);
  assert.equal(first.booking.photographerEarningsHalalas, 8000);
  const notices = await db.select().from(photographyDeliveriesTable).where(eq(photographyDeliveriesTable.bookingId, bookingId));
  assert.equal(notices.length, 2);
  assert.equal(notices.every(n => n.status === "blocked"), true);
  const portal = await request<{ bookings: unknown[]; earnings: { netHalalas: number } }>("/photography/portal");
  assert.equal(portal.data.bookings.length, 1);
  assert.equal(portal.data.earnings.netHalalas, 8000);
  const internal = await request<{ notifications: { id: number; bookingId: number; readAt: string | null }[] }>("/photography/portal");
  assert.equal(internal.data.notifications.length, 1, "Only the photographer-side notice is visible internally");
  assert.equal(internal.data.notifications[0].bookingId, bookingId);
  assert.equal(internal.data.notifications[0].readAt, null);
  const ownerMessage = notices.find(m => m.dedupeKey.endsWith(":owner"))!;
  assert.equal((await request(`/photography/notifications/${ownerMessage.id}/read`, {})).status, 404);
  assert.equal((await request(`/photography/notifications/${internal.data.notifications[0].id}/read`, {})).status, 200);
  const refreshed = await request<{ notifications: { readAt: string | null }[] }>("/photography/portal");
  assert.ok(refreshed.data.notifications[0].readAt);
  assert.equal((await request("/photography/notifications/invalid/read", {})).status, 400);
});
test("unified platform login authenticates photographer without granting owner access", async () => {
  const response = await request<{ redirect: string }>("/accounts/owner-login", { identifier: phone, password: "TestPassword123!" }, "");
  assert.equal(response.status, 200);
  assert.equal(response.data.redirect, "/photographer");
  assert.match(response.cookie!, /photographer_session=/);
  sessionCookie = response.cookie!.split(";")[0];
  assert.equal((await request("/photography/portal")).status, 200);
  assert.equal((await request("/accounts/owner-login", { identifier: phone, password: "IncorrectPassword" }, "")).status, 401);
});
test("contract publication is privileged, sanitized and preserves past acceptance", async () => {
  assert.equal((await request("/admin/photography/contract", { html: "<p>test</p>" }, "", "owner")).status, 403);
  const published = await request<{ id: number; html: string }>("/admin/photography/contract", {
    html: '<h2>عقد اختبار مؤقت</h2><p onclick="bad()">تعديل بنود</p><script>bad()</script>',
  }, "", "superadmin");
  assert.equal(published.status, 201);
  temporaryContracts.push(published.data.id);
  assert.doesNotMatch(published.data.html, /onclick|script/);
  const current = await request<{ id: number }>("/photography/contract");
  assert.equal(current.data.id, published.data.id);
  const portal = await request<{ photographer: { contractVersion: number } }>("/photography/portal");
  assert.equal(portal.data.photographer.contractVersion, contractId);
});
test("photographer support reaches the shared admin inbox and reads are owner-scoped", async () => {
  assert.equal((await request("/photography/support-requests", { subject: "test", message: "test" }, "")).status, 401);
  const created = await request<{ id: number }>("/photography/support-requests", { subject: "طلب اختبار مؤقت", message: "استفسار عن مستحقاتي" });
  assert.equal(created.status, 201);
  const stored = await db.execute<{ owner_id: string; owner_name: string }>(sql`SELECT owner_id, owner_name FROM owner_support_requests WHERE id = ${created.data.id}`);
  assert.equal(stored.rows[0].owner_id, `photographer_${photographerId}`);
  assert.match(stored.rows[0].owner_name, /مصور:/);
  await db.execute(sql`UPDATE owner_support_requests SET admin_reply = 'رد اختبار الإدارة', admin_reply_at = now(), is_read_by_owner = false WHERE id = ${created.data.id}`);
  const history = await request<{ id: number; admin_reply: string; is_read_by_owner: boolean }[]>("/photography/support-requests");
  assert.equal(history.data.find(r => r.id === created.data.id)?.admin_reply, "رد اختبار الإدارة");
  assert.equal((await request(`/photography/support-requests/${created.data.id}/mark-read`, {})).status, 200);
  assert.equal((await request("/photography/support-requests/2147483647/mark-read", {})).status, 404);
});
test("recorded external transfers reduce net due without executing payments or double counting", async () => {
  const route = `/admin/photography/photographers/${photographerId}/transfers`;
  const record = { amountHalalas: 2000, reference: `photo-test-transfer-${randomUUID()}`, transferredAt: new Date(Date.now() - 60000).toISOString() };
  assert.equal((await request(route, record, "", "owner")).status, 403);
  assert.equal((await request(route, { ...record, amountHalalas: 8001 }, "", "superadmin")).status, 400);
  assert.equal((await request(route, record, "", "superadmin")).status, 201);
  assert.equal((await request(route, record, "", "superadmin")).status, 409);
  const portal = await request<{ earnings: { netDueHalalas: number; transferredHalalas: number } }>("/photography/portal");
  assert.equal(portal.data.earnings.netDueHalalas, 6000);
  assert.equal(portal.data.earnings.transferredHalalas, 2000);
  assert.equal((await request(route, { ...record, reference: `${record.reference}-future`, transferredAt: new Date(Date.now() + 86400000).toISOString() }, "", "superadmin")).status, 400);
});
test("other-bank names persist and administration returns searchable city names", async () => {
  const portal = await request<{ photographer: Record<string, unknown> }>("/photography/portal");
  const custom = { ...portal.data.photographer, bankName: "  بنك مخصص للاختبار  " };
  const update = await fetch(`${base}/photography/portal`, {
    method: "PATCH", headers: { Cookie: sessionCookie, Origin: base, "Content-Type": "application/json" }, body: JSON.stringify(custom),
  });
  assert.equal(update.status, 200);
  const stored = await request<{ photographer: { bankName: string } }>("/photography/portal");
  assert.equal(stored.data.photographer.bankName, "بنك مخصص للاختبار");
  const admin = await request<{ photographers: { id: number; cityName: string | null }[] }>("/admin/photography", undefined, "", "superadmin");
  assert.equal(admin.status, 200);
  assert.ok(admin.data.photographers.find(p => p.id === photographerId)?.cityName);
});
test("administration displays owner names for legacy and durably linked booking identities", async () => {
  const listing = () => request<{ bookings: { id: number; ownerName: string | null }[] }>("/admin/photography", undefined, "", "superadmin");
  assert.equal((await listing()).data.bookings.find(b => b.id === bookingId)?.ownerName, null);
  const owner = await db.execute<{ id: number }>(sql`
    INSERT INTO owner_applications (full_name, business_name, business_type, phone, email, password_hash, status, email_verified)
    VALUES ('مالك جلسة اختبار', 'نشاط اختبار', 'chalet', ${phone}, ${`${ownerId}@example.test`}, '', 'approved', true)
    RETURNING id`);
  const id = owner.rows[0].id;
  try {
    await db.update(photographyBookingsTable).set({ ownerId: `owner_${id}` }).where(eq(photographyBookingsTable.id, bookingId));
    assert.equal((await listing()).data.bookings.find(b => b.id === bookingId)?.ownerName, "مالك جلسة اختبار");
    await db.execute(sql`INSERT INTO owner_account_links (user_id, owner_application_id) VALUES (${ownerId}, ${id})`);
    await db.update(photographyBookingsTable).set({ ownerId }).where(eq(photographyBookingsTable.id, bookingId));
    assert.equal((await listing()).data.bookings.find(b => b.id === bookingId)?.ownerName, "مالك جلسة اختبار");
  } finally {
    await db.update(photographyBookingsTable).set({ ownerId }).where(eq(photographyBookingsTable.id, bookingId));
    await db.execute(sql`DELETE FROM owner_account_links WHERE user_id = ${ownerId}`);
    await db.execute(sql`DELETE FROM owner_applications WHERE id = ${id}`);
  }
});
