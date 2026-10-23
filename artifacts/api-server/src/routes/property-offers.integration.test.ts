import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import { CreatePropertyOfferResponse, GetPropertyPriceQuoteResponse } from "@workspace/api-zod";
import { db, pool, chaletSubmissionsTable, chaletsTable, propertyOffersTable, chaletSeasonsTable, globalSeasonsTable, chaletGlobalSeasonsTable, sessionsTable, ownerSubscriptionsTable, ownerBookingsTable, ownerCustomersTable, chaletAvailabilityTable, ownerNotificationsTable } from "@workspace/db";

const owner = `offers-test-${randomUUID()}`;
let session: string, outsider: string, base: string, server: Server, subId: number, chaletId: number, offerId: number, globalId: number, bookingId: number;
const valid = { nameAr: "عرض منتصف الأسبوع", startDate: "2026-10-01", endDate: "2026-10-31", weekdays: [0, 1, 2, 3], discountType: "percent", value: 20, enabled: true };
const headers = () => ({ authorization: `Bearer ${session}`, "content-type": "application/json" });
const request = (path: string, method = "GET", body?: unknown, other = false) => fetch(`${base}/api${path}`, {
  method, headers: other ? { ...headers(), authorization: `Bearer ${outsider}` } : headers(),
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
before(async () => {
  const data = { ownerId: owner, nameAr: "Synthetic offers fixture", whatsappNumber: "0500000000", location: "اختبار", descriptionAr: "اختبار معزول", pricePerNight: "1000", priceFullDay: "1000", priceMorning: "400", priceEvening: "600", status: "approved" as const };
  const [sub] = await db.insert(chaletSubmissionsTable).values(data).returning();
  subId = sub.id;
  const [chalet] = await db.insert(chaletsTable).values({ ...data, submissionId: subId, dailyPrices: { fullday: { "4": 900 } } }).returning();
  chaletId = chalet.id;
  session = await createSession({ user: { id: owner, email: null, firstName: "Synthetic", lastName: "Owner", profileImageUrl: null }, access_token: "test" });
  outsider = await createSession({ user: { id: `${owner}-other`, email: null, firstName: "Synthetic", lastName: "Other", profileImageUrl: null }, access_token: "test" });
  await db.insert(ownerSubscriptionsTable).values({ ownerId: owner, plan: "monthly", status: "active", expiresAt: new Date("2030-01-01") });
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  try {
  await db.delete(ownerNotificationsTable).where(eq(ownerNotificationsTable.ownerId, owner));
  await db.delete(chaletAvailabilityTable).where(eq(chaletAvailabilityTable.chaletId, chaletId));
  await db.delete(ownerBookingsTable).where(eq(ownerBookingsTable.ownerId, owner));
  await db.delete(ownerCustomersTable).where(eq(ownerCustomersTable.ownerId, owner));
  await db.delete(ownerSubscriptionsTable).where(eq(ownerSubscriptionsTable.ownerId, owner));
  await db.delete(propertyOffersTable).where(eq(propertyOffersTable.submissionId, subId));
  await db.delete(chaletSeasonsTable).where(eq(chaletSeasonsTable.submissionId, subId));
  await db.delete(chaletGlobalSeasonsTable).where(eq(chaletGlobalSeasonsTable.submissionId, subId));
  if (globalId) await db.delete(globalSeasonsTable).where(eq(globalSeasonsTable.id, globalId));
  await db.delete(chaletsTable).where(eq(chaletsTable.id, chaletId));
  await db.delete(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, subId));
  await db.delete(sessionsTable).where(inArray(sessionsTable.sid, [session, outsider].filter(Boolean)));
  } finally {
  if (server) { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  await pool.end();
  }
});
test("offer CRUD persists, isolates properties and validates real calendar days and values", async () => {
  const properties = await (await request("/owner/chalets")).json() as Array<{ id: number; submissionId: number }>;
  const property = properties.find(item => item.id === chaletId);
  assert(property, "The published property must be returned to its owner");
  assert.equal(property.submissionId, subId, "Offers must receive submissionId, not the published property's id");
  assert.equal((await request(`/owner/offers?submissionId=${property.submissionId}`)).status, 200);
  assert.equal((await fetch(`${base}/api/owner/offers?submissionId=${subId}`)).status, 401);
  assert.equal((await request(`/owner/offers?submissionId=${subId}`, "GET", undefined, true)).status, 403);
  for (const invalid of [
    { endDate: "2026-09-01" }, { startDate: "2026-02-30" }, { weekdays: [] },
    { weekdays: [7] }, { weekdays: [1, 1] }, { value: 101 }, { value: 0 }, { value: 2.001 },
  ]) assert.equal((await request("/owner/offers", "POST", { ...valid, submissionId: subId, ...invalid })).status, 400);
  const created = await request("/owner/offers", "POST", { ...valid, submissionId: subId });
  assert.equal(created.status, 201);
  const offer = CreatePropertyOfferResponse.parse(await created.json()); offerId = offer.id;
  assert.equal(offer.value, 20);
  assert.equal((await request(`/owner/offers/${offerId}`, "PATCH", { value: 30 }, true)).status, 404);
  assert.equal((await request(`/owner/offers/${offerId}`, "DELETE", undefined, true)).status, 404);
  assert.equal((await request(`/owner/offers/${offerId}`, "PATCH", { endDate: "2026-09-01" })).status, 400);
  assert.equal((await request(`/owner/offers?submissionId=${subId}`)).status, 200);
});
test("public and owner quotes agree on seasonal price, selected weekdays and multi-day totals", async () => {
  await db.insert(chaletSeasonsTable).values({ ownerId: owner, submissionId: subId, nameAr: "موسم تجريبي", startDate: "2026-10-20", endDate: "2026-10-21", price: "1500", priceFullDay: "1500", dailyPrices: { "2026-10-21": { fullDay: 1600 } } });
  const [global] = await db.insert(globalSeasonsTable).values({ nameAr: "Synthetic offers global", startDate: "2026-10-01", endDate: "2026-10-31", isActive: true }).returning();
  globalId = global.id;
  await db.insert(chaletGlobalSeasonsTable).values({ submissionId: subId, globalSeasonId: global.id, enabled: true, priceFullDay: "1300" });
  const query = "date=2026-10-21&period=full_day&durationDays=2";
  const publicRes = await request(`/chalets/${chaletId}/price-quote?${query}`);
  assert.equal(publicRes.status, 200);
  const quote = GetPropertyPriceQuoteResponse.parse(await publicRes.json());
  assert.equal(quote.days[0].basePrice, 1600);
  assert.equal(quote.days[0].price, 1280);
  assert.equal(quote.days[1].basePrice, 1300);
  assert.equal(quote.days[1].price, 1300); // Thursday not in the offer
  assert.equal(quote.price, 2580);
  assert.deepEqual(await (await request(`/owner/price-quote?submissionId=${subId}&${query}`)).json(), quote);
  assert.equal((await request(`/chalets/${chaletId}/price-quote?date=2026-02-30&period=full_day`)).status, 400);
});
test("best offer does not stack, and disabling/deleting immediately restores the correct price", async () => {
  const fixed = CreatePropertyOfferResponse.parse(await (await request("/owner/offers", "POST", { ...valid, submissionId: subId, discountType: "fixed", value: 400 })).json());
  const quote = async () => GetPropertyPriceQuoteResponse.parse(await (await request(`/chalets/${chaletId}/price-quote?date=2026-10-21&period=full_day`)).json());
  assert.equal((await quote()).price, 1200);
  assert.equal((await quote()).days[0].offerId, fixed.id);
  assert.equal((await request(`/owner/offers/${fixed.id}`, "PATCH", { enabled: false })).status, 200);
  assert.equal((await quote()).price, 1280);
  assert.equal((await request(`/owner/offers/${offerId}`, "PATCH", { discountType: "night_price", value: 900 })).status, 200);
  assert.equal((await quote()).price, 900);
  const bookingBody = { submissionId: subId, clientPhone: "0500000000", clientName: "Synthetic offer booking", bookingDate: "2026-10-21", period: "full_day", applyOfferPrice: true, totalPrice: 100, depositPaid: 0 };
  assert.equal((await request("/owner/bookings", "POST", bookingBody)).status, 409);
  const bookingRes = await request("/owner/bookings", "POST", { ...bookingBody, totalPrice: 900 });
  assert.equal(bookingRes.status, 201, await bookingRes.clone().text());
  const booking = await bookingRes.json() as { id: number; totalPrice: string; offerSnapshot: { price: number; basePrice: number } };
  bookingId = booking.id;
  assert.equal(Number(booking.totalPrice), 900);
  assert.equal(booking.offerSnapshot.basePrice, 1600);
  assert.equal(booking.offerSnapshot.price, 900);
  assert.equal((await request(`/owner/offers/${offerId}`, "DELETE")).status, 204);
  assert.equal((await quote()).price, 1600);
  const [historical] = await db.select().from(ownerBookingsTable).where(eq(ownerBookingsTable.id, bookingId));
  assert.equal(Number(historical.totalPrice), 900);
  assert.equal(historical.offerSnapshot?.price, 900);
});
