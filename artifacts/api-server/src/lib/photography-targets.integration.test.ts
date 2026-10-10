import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import type { Server } from "node:http";
import {
  db, pool, chaletSubmissionsTable, chaletsTable, serviceProviderSubmissionsTable,
  serviceProvidersTable, serviceRegionsCatalogTable, serviceCitiesCatalogTable,
  regionsCatalogTable, citiesCatalogTable, photographersTable, photographyPackagesTable,
  photographyBookingsTable, siteSettingsTable,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";
import {
  photographyActivities, ownedPhotographyTarget, coveredPhotographyTarget,
  photographyReservationSchema,
} from "./photography-targets";
import photographyRouter from "../routes/photography";

const suffix = randomUUID();
const ownerId = `photo-target-owner-${suffix}`, otherOwner = `photo-target-other-${suffix}`;
let propertyId = 0, chaletId = 0, regionId = 0, cityId = 0, serviceRegionId = 0, serviceCityId = 0;
let photographerId = 0, packageId = 0;
const serviceIds: number[] = [], providerIds: number[] = [], bookingIds: number[] = [];
let server: Server, base = "";
const name = `TEST-photo-target-${suffix}`;

before(async () => {
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  assert.equal(setting?.value, "false", "Never activate the real service in tests");
  const [region] = await db.insert(regionsCatalogTable).values({ name }).returning();
  regionId = region.id;
  const [city] = await db.insert(citiesCatalogTable).values({ name, regionId }).returning();
  cityId = city.id;
  const [serviceRegion] = await db.insert(serviceRegionsCatalogTable).values({ name }).returning();
  serviceRegionId = serviceRegion.id;
  const [serviceCity] = await db.insert(serviceCitiesCatalogTable).values({ name, regionId: serviceRegionId }).returning();
  serviceCityId = serviceCity.id;
  const [property] = await db.insert(chaletSubmissionsTable).values({
    ownerId, nameAr: name, descriptionAr: name, location: name, region: name,
    whatsappNumber: "0500000000", pricePerNight: "100", status: "approved",
  }).returning();
  propertyId = property.id;
  const [chalet] = await db.insert(chaletsTable).values({
    ownerId, submissionId: propertyId, nameAr: name, descriptionAr: name,
    location: name, region: name, pricePerNight: "100", whatsappNumber: "0500000000", isActive: true,
  }).returning();
  chaletId = chalet.id;
  for (const variant of ["owned", "foreign", "pending", "inactive"] as const) {
    const [submission] = await db.insert(serviceProviderSubmissionsTable).values({
      ownerId: variant === "foreign" ? otherOwner : ownerId, businessName: `${name}-${variant}`,
      category: "TEST", city: name, serviceCityId, serviceRegionId, whatsappNumber: "0500000000",
      status: variant === "pending" ? "pending" : "approved",
    }).returning();
    serviceIds.push(submission.id);
    const [provider] = await db.insert(serviceProvidersTable).values({
      submissionId: submission.id, ownerId: submission.ownerId, businessName: submission.businessName,
      category: "TEST", city: name, serviceCityId, serviceRegionId, whatsappNumber: "0500000000",
      isActive: variant !== "inactive",
    }).returning();
    providerIds.push(provider.id);
  }
  const [photographer] = await db.insert(photographersTable).values({
    name, whatsapp: `test-${suffix}`, status: "approved", regionId, cityId, allDistricts: true,
  }).returning();
  photographerId = photographer.id;
  const [pack] = await db.insert(photographyPackagesTable).values({
    name, priceHalalas: 10000, platformPercent: "20", active: false,
  }).returning();
  packageId = pack.id;
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: req.get("X-Owner") || ownerId } as Express.User;
    req.isAuthenticated = (() => true) as typeof req.isAuthenticated;
    next();
  });
  app.use("/photography", photographyRouter);
  server = app.listen(0);
  await new Promise<void>(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (bookingIds.length) await db.delete(photographyBookingsTable).where(inArray(photographyBookingsTable.id, bookingIds));
  if (photographerId) await db.delete(photographersTable).where(eq(photographersTable.id, photographerId));
  if (packageId) await db.delete(photographyPackagesTable).where(eq(photographyPackagesTable.id, packageId));
  if (providerIds.length) await db.delete(serviceProvidersTable).where(inArray(serviceProvidersTable.id, providerIds));
  if (serviceIds.length) await db.delete(serviceProviderSubmissionsTable).where(inArray(serviceProviderSubmissionsTable.id, serviceIds));
  if (chaletId) await db.delete(chaletsTable).where(eq(chaletsTable.id, chaletId));
  if (propertyId) await db.delete(chaletSubmissionsTable).where(eq(chaletSubmissionsTable.id, propertyId));
  if (cityId) await db.delete(citiesCatalogTable).where(eq(citiesCatalogTable.id, cityId));
  if (regionId) await db.delete(regionsCatalogTable).where(eq(regionsCatalogTable.id, regionId));
  if (serviceCityId) await db.delete(serviceCitiesCatalogTable).where(eq(serviceCitiesCatalogTable.id, serviceCityId));
  if (serviceRegionId) await db.delete(serviceRegionsCatalogTable).where(eq(serviceRegionsCatalogTable.id, serviceRegionId));
  const [setting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_enabled"));
  assert.equal(setting?.value, "false");
  await pool.end();
});

test("reservation contract requires exactly one typed, positive activity identity", () => {
  const common = { photographerId: 1, packageId: 1, startAt: "2026-12-01T10:00:00Z" };
  assert.ok(photographyReservationSchema.safeParse({ ...common, propertyId: 1 }).success);
  assert.ok(photographyReservationSchema.safeParse({ ...common, serviceSubmissionId: 1 }).success);
  for (const input of [{}, { propertyId: 1, serviceSubmissionId: 1 }, { serviceSubmissionId: -1 },
    { serviceSubmissionId: 1.5 }, { serviceSubmissionId: "1" }, { serviceSubmissionId: 1, ownerId: otherOwner }]) {
    assert.equal(photographyReservationSchema.safeParse({ ...common, ...input }).success, false);
  }
});
test("both owner activity types are eligible; pending, inactive and foreign services are excluded", async () => {
  const catalog = await photographyActivities([ownerId]);
  assert.deepEqual(catalog.properties.map(p => p.id), [propertyId]);
  assert.deepEqual(catalog.services.map(s => s.id), [serviceIds[0]]);
  assert.equal(catalog.services[0].kind, "service");
  const locked = await db.transaction(tx => ownedPhotographyTarget([ownerId], { serviceSubmissionId: serviceIds[0] }, tx, true));
  assert.equal(locked?.id, serviceIds[0]);
});
test("service-only owners can resolve their service without owning any property", async () => {
  const target = await ownedPhotographyTarget([otherOwner], { serviceSubmissionId: serviceIds[1] });
  assert.equal(target?.kind, "service");
  assert.equal(target?.ownerId, otherOwner);
  assert.equal((await photographyActivities([otherOwner])).properties.length, 0);
  assert.equal(await ownedPhotographyTarget([otherOwner], { propertyId }), null);
  assert.equal(await ownedPhotographyTarget([ownerId], { serviceSubmissionId: serviceIds[1] }), null);
  assert.equal(await ownedPhotographyTarget([ownerId], { serviceSubmissionId: serviceIds[2] }), null);
  assert.equal(await ownedPhotographyTarget([ownerId], { serviceSubmissionId: serviceIds[3] }), null);
});
test("property coverage remains valid; services use independent location catalogs and never widen district-only coverage", async () => {
  const [p] = await db.select().from(photographersTable).where(eq(photographersTable.id, photographerId));
  const service = (await ownedPhotographyTarget([ownerId], { serviceSubmissionId: serviceIds[0] }))!;
  const property = (await ownedPhotographyTarget([ownerId], { propertyId }))!;
  assert.equal(await coveredPhotographyTarget(service, p), true);
  assert.equal(await coveredPhotographyTarget(property, p), true);
  assert.equal(await coveredPhotographyTarget(service, { ...p, allDistricts: false }), false);
  assert.equal(await coveredPhotographyTarget(service, { ...p, status: "pending" }), false);
  assert.equal(await coveredPhotographyTarget({ ...service, location: "خارج النطاق" }, p), false);
  await db.update(serviceCitiesCatalogTable).set({ isActive: false }).where(eq(serviceCitiesCatalogTable.id, serviceCityId));
  assert.equal(await ownedPhotographyTarget([ownerId], { serviceSubmissionId: serviceIds[0] }), null);
  await db.update(serviceCitiesCatalogTable).set({ isActive: true }).where(eq(serviceCitiesCatalogTable.id, serviceCityId));
});
test("service booking snapshots persist independently and are exposed only to the owning account", async () => {
  const snapshot = {
    ownerId: otherOwner, propertyName: `${name}-foreign`, photographerId, packageId,
    photographerName: name, packageName: name, ownerPhone: "966500000000", photographerPhone: "966500000000",
    startAt: new Date("2026-12-01T10:00:00Z"), endAt: new Date("2026-12-01T11:00:00Z"),
    expiresAt: new Date("2026-12-01T09:00:00Z"), status: "expired",
    priceHalalas: 10000, commissionHalalas: 2000, photographerEarningsHalalas: 8000,
  };
  const [booking] = await db.insert(photographyBookingsTable).values({
    ...snapshot, propertyId: null, serviceSubmissionId: serviceIds[1],
  }).returning();
  bookingIds.push(booking.id);
  assert.equal(booking.propertyId, null);
  assert.equal(booking.serviceSubmissionId, serviceIds[1]);
  const own = await fetch(`${base}/photography/bookings`, { headers: { "X-Owner": otherOwner } });
  assert.equal(own.status, 200);
  const ownData = await own.json() as { bookings: { id: number; serviceSubmissionId: number | null }[] };
  assert.equal(ownData.bookings.find(b => b.id === booking.id)?.serviceSubmissionId, serviceIds[1]);
  const stranger = await fetch(`${base}/photography/bookings`, { headers: { "X-Owner": ownerId } });
  const strangerData = await stranger.json() as { bookings: { id: number }[] };
  assert.equal(strangerData.bookings.some(b => b.id === booking.id), false);
  for (const targets of [{ propertyId: null, serviceSubmissionId: null }, { propertyId, serviceSubmissionId: serviceIds[1] }]) {
    await assert.rejects(async () => { await db.insert(photographyBookingsTable).values({ ...snapshot, ...targets }); });
  }
});
test("closed service still rejects service reservations, slots and checkout without activating payments", async () => {
  const slots = await fetch(`${base}/photography/slots?serviceSubmissionId=${serviceIds[1]}&photographerId=${photographerId}&date=2026-12-01`);
  assert.equal(slots.status, 423);
  const booking = await fetch(`${base}/photography/bookings`, {
    method: "POST", headers: { Origin: base, "Content-Type": "application/json", "X-Owner": otherOwner },
    body: JSON.stringify({ serviceSubmissionId: serviceIds[1], photographerId, packageId, startAt: "2026-12-01T10:00:00Z" }),
  });
  assert.equal(booking.status, 423);
  const catalog = await fetch(`${base}/photography/catalog`);
  const data = await catalog.json() as { enabled: boolean; services: unknown[] };
  assert.equal(data.enabled, false);
  assert.deepEqual(data.services, []);
});
