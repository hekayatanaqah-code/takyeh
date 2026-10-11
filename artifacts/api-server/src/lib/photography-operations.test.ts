import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test, before, beforeEach, after } from "node:test";
import {
  db, pool, photographersTable, photographyPackagesTable, photographyBookingsTable,
  photographyReviewsTable, photographyCancellationsTable, photographyAlertsTable,
  photographyDeliveriesTable, regionsCatalogTable, citiesCatalogTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { photographyPolicy, qualityEligible, rotationWeight, roundRobinTurn } from "./photography-allocation-policy";
import { allocatePhotography, lockPhotographyAllocation, recentCancellationCounts, photographyUnionSlots, canCoverExactInterval } from "./photography-allocation";
import { declinePhotography, retryPhotographyAssignment, deliverPhotography, ratePhotography, photographyDeclineSchema, photographyRatingSchema } from "./photography-operations";
import { photographyBalances } from "./photography-finance";
import { photographerNotifications } from "../routes/photography-notifications";
import type { PhotographyTarget } from "./photography-targets";

const suffix = randomUUID().slice(0, 8);
const ids: number[] = [], bookingIds: number[] = [];
let regionId: number, cityId: number, packageId: number, target: PhotographyTarget;
const availability = Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: "00:00", end: "23:59" }));
const date = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
const start = new Date(`${date}T10:00:00+03:00`);
const ownerId = `photography-ops-${suffix}`;
before(async () => {
  const [region] = await db.insert(regionsCatalogTable).values({ name: `PhotoOps-${suffix}`, isActive: true }).returning();
  regionId = region.id;
  const [city] = await db.insert(citiesCatalogTable).values({ name: `PhotoOpsCity-${suffix}`, regionId, isActive: true }).returning();
  cityId = city.id;
  const [pack] = await db.insert(photographyPackagesTable).values({ name: `PhotoOps-${suffix}`, priceHalalas: 10000, platformPercent: "20", active: false }).returning();
  packageId = pack.id;
  for (let i = 0; i < 4; i++) {
    const [p] = await db.insert(photographersTable).values({
      name: `PhotoOps-${suffix}-${i}`, whatsapp: `9665${String(Number.parseInt(suffix, 16) % 10000000).padStart(7, "0")}${i}`,
      status: "approved", regionId, cityId, allDistricts: true, sessionMinutes: 60, availability,
    }).returning();
    ids.push(p.id);
  }
  target = { id: 700001, kind: "property", ownerId, nameAr: `PhotoOps-${suffix}`, location: city.name, region: region.name, district: null, whatsappNumber: "966500000000" };
});
beforeEach(async () => {
  if (bookingIds.length) await db.delete(photographyBookingsTable).where(inArray(photographyBookingsTable.id, bookingIds.splice(0)));
  await db.delete(photographyAlertsTable).where(inArray(photographyAlertsTable.photographerId, ids));
  await db.update(photographersTable).set({
    status: "approved", confirmedAssignments: 10, rotationCredit: 0, lastAssignedAt: null,
    ratingSum: 0, ratingCount: 0, blockedDates: [], availability, sessionMinutes: 60,
  }).where(inArray(photographersTable.id, ids));
});
after(async () => {
  if (bookingIds.length) await db.delete(photographyBookingsTable).where(inArray(photographyBookingsTable.id, bookingIds));
  if (ids.length) {
    await db.delete(photographyAlertsTable).where(inArray(photographyAlertsTable.photographerId, ids));
    await db.delete(photographersTable).where(inArray(photographersTable.id, ids));
  }
  if (packageId) await db.delete(photographyPackagesTable).where(eq(photographyPackagesTable.id, packageId));
  if (cityId) await db.delete(citiesCatalogTable).where(eq(citiesCatalogTable.id, cityId));
  if (regionId) await db.delete(regionsCatalogTable).where(eq(regionsCatalogTable.id, regionId));
  await pool.end();
});
async function booking(p = ids[0], overrides: Partial<typeof photographyBookingsTable.$inferInsert> = {}) {
  const [row] = await db.insert(photographyBookingsTable).values({
    ownerId, propertyId: target.id, photographerId: p, packageId, propertyName: target.nameAr,
    packageName: "PhotoOps", photographerName: `PhotoOps-${p}`, ownerPhone: target.whatsappNumber,
    photographerPhone: "966500000001", startAt: start, endAt: new Date(+start + 3600000),
    expiresAt: new Date(+start + 3600000), status: "confirmed", priceHalalas: 10000,
    commissionHalalas: 2000, photographerEarningsHalalas: 8000, invoiceId: randomUUID(), paymentId: randomUUID(),
    targetCity: target.location, targetRegion: target.region, targetDistrict: target.district, ...overrides,
  }).returning();
  bookingIds.push(row.id);
  return row;
}
async function allocateAndHold(at: Date) {
  return db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    const choice = await allocatePhotography(tx, target, at, { endAt: new Date(+at + 3600000) });
    if (!choice) return null;
    const p = choice.photographer;
    const [row] = await tx.insert(photographyBookingsTable).values({
      ownerId, propertyId: target.id, photographerId: p.id, packageId, propertyName: target.nameAr,
      packageName: "PhotoOps", photographerName: p.name, ownerPhone: target.whatsappNumber,
      photographerPhone: p.whatsapp, startAt: at, endAt: choice.endAt, expiresAt: new Date(Date.now() + 900000),
      priceHalalas: 10000, commissionHalalas: 2000, photographerEarningsHalalas: 8000,
    }).returning();
    bookingIds.push(row.id);
    return p.id;
  });
}
test("policy boundaries and mandatory reason/rating validation", () => {
  assert.equal(photographyPolicy.introBookings, 3);
  assert.equal(rotationWeight(2, 0), 4);
  assert.equal(rotationWeight(3, 0), 2);
  assert.equal(rotationWeight(0, 3), 1);
  assert.equal(qualityEligible({ status: "approved", ratingSum: 7, ratingCount: 2 }), true);
  assert.equal(qualityEligible({ status: "approved", ratingSum: 10, ratingCount: 3 }), false);
  assert.equal(qualityEligible({ status: "pending", ratingSum: 5, ratingCount: 1 }), false);
  assert.equal(photographyDeclineSchema.safeParse({}).success, false);
  assert.equal(photographyDeclineSchema.safeParse({ reason: "other" }).success, true);
  for (const stars of [0, 6, 3.5]) assert.equal(photographyRatingSchema.safeParse({ stars }).success, false);
});
test("steady-state equal weighted turns are strict round-robin", () => {
  let people = [1, 2, 3].map(id => ({ id, rotationCredit: 0, weight: 2, lastAssignedAt: null as Date | null }));
  const turns: number[] = [];
  for (let i = 0; i < 12; i++) {
    const turn = roundRobinTurn(people)!;
    turns.push(turn.winner.id);
    people = people.map(p => ({ ...p, rotationCredit: turn.credits.find(c => c.id === p.id)!.credit, lastAssignedAt: p.id === turn.winner.id ? new Date(i + 1) : p.lastAssignedAt }));
  }
  assert.deepEqual(turns, [1, 2, 3, 1, 2, 3, 1, 2, 3, 1, 2, 3]);
});
test("intro boost does not starve existing photographers; repeated declines lower share", () => {
  let people = [4, 2, 1].map((weight, i) => ({ id: i, weight, rotationCredit: 0, lastAssignedAt: null as Date | null }));
  const counts = [0, 0, 0];
  for (let i = 0; i < 70; i++) {
    const turn = roundRobinTurn(people)!;
    counts[turn.winner.id]++;
    people = people.map(p => ({ ...p, rotationCredit: turn.credits.find(c => c.id === p.id)!.credit }));
  }
  assert.deepEqual(counts, [40, 20, 10]);
});
test("real persisted allocations balance reservations and serialize simultaneous holds", async () => {
  const picks: number[] = [];
  for (let i = 0; i < 12; i++) picks.push((await allocateAndHold(new Date(+start + i * 3600000)))!);
  for (const id of ids) assert.equal(picks.filter(p => p === id).length, 3);
  const other = new Date(+start + 86400000);
  const raced = await Promise.all(Array.from({ length: 5 }, () => allocateAndHold(other)));
  assert.equal(raced.filter(Boolean).length, 4);
  assert.equal(new Set(raced.filter(Boolean)).size, 4);
});
test("union slots exclude closed dates, low quality, pending status and occupied intervals", async () => {
  await db.update(photographersTable).set({ ratingSum: 3, ratingCount: 1 }).where(eq(photographersTable.id, ids[0]));
  await db.update(photographersTable).set({ status: "pending" }).where(eq(photographersTable.id, ids[1]));
  await db.update(photographersTable).set({ blockedDates: [date] }).where(eq(photographersTable.id, ids[2]));
  await booking(ids[3]);
  const slots = await photographyUnionSlots(target, date);
  assert.equal(slots.some(s => s.startAt === start.toISOString()), false);
  assert.equal(slots.some(s => s.startAt === new Date(+start + 3600000).toISOString()), true);
});
test("replacement preserves the entire paid booking and creates no owner notice", async () => {
  const original = await booking();
  await db.insert(photographyDeliveriesTable).values([
    { dedupeKey: `booking:${original.id}:owner`, bookingId: original.id, recipient: original.ownerPhone, kind: "booking", parameters: [], status: "accepted" },
    { dedupeKey: `booking:${original.id}:photographer`, bookingId: original.id, photographerId: ids[0], recipient: original.photographerPhone, kind: "booking", parameters: [] },
  ]);
  const result = await declinePhotography(original.id, ids[0], { reason: "equipment", details: "Test camera failure" });
  assert.equal(result.reassigned, true);
  const [updated] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, original.id));
  assert.notEqual(updated.photographerId, original.photographerId);
  for (const field of ["ownerId", "priceHalalas", "commissionHalalas", "photographerEarningsHalalas", "invoiceId", "paymentId", "status", "propertyId", "packageId"] as const) assert.equal(updated[field], original[field]);
  assert.equal(+updated.startAt, +original.startAt);
  assert.equal(+updated.endAt, +original.endAt);
  const messages = await db.select().from(photographyDeliveriesTable).where(eq(photographyDeliveriesTable.bookingId, original.id));
  assert.equal(messages.filter(m => m.dedupeKey.endsWith(":owner")).length, 1);
  assert.equal((await photographerNotifications(ids[0])).length, 0);
  assert.equal((await photographerNotifications(updated.photographerId)).length, 1);
  await declinePhotography(original.id, ids[0], { reason: "other" });
  const records = await db.select().from(photographyCancellationsTable).where(eq(photographyCancellationsTable.bookingId, original.id));
  assert.equal(records.length, 1);
  assert.equal(records[0].reason, "equipment");
});
test("no replacement preserves payment, exposes urgent review, and admin retry later assigns", async () => {
  await db.update(photographersTable).set({ status: "suspended" }).where(inArray(photographersTable.id, ids.slice(1)));
  const original = await booking();
  const result = await declinePhotography(original.id, ids[0], { reason: "emergency" });
  assert.equal(result.needsAdminReview, true);
  const [waiting] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, original.id));
  assert.equal(waiting.status, "confirmed");
  assert.equal(waiting.assignmentStatus, "needs_review");
  assert.equal(waiting.paymentId, original.paymentId);
  assert.equal((await photographyBalances(ids[0])).netDueHalalas, 0);
  const [alert] = await db.select().from(photographyAlertsTable).where(eq(photographyAlertsTable.bookingId, original.id));
  assert.equal(alert.kind, "replacement_needed");
  await db.update(photographersTable).set({ status: "approved" }).where(eq(photographersTable.id, ids[1]));
  assert.equal((await retryPhotographyAssignment(original.id)).reassigned, true);
  const [resolved] = await db.select().from(photographyAlertsTable).where(eq(photographyAlertsTable.id, alert.id));
  assert.ok(resolved.resolvedAt);
});
test("three declines reduce priority and notify admin; old declines no longer count", async () => {
  for (let i = 0; i < 3; i++) {
    const row = await booking(ids[0], { startAt: new Date(+start + i * 3600000), endAt: new Date(+start + (i + 1) * 3600000) });
    await declinePhotography(row.id, ids[0], { reason: "personal" });
  }
  assert.equal((await recentCancellationCounts()).get(ids[0]), 3);
  const [alert] = await db.select().from(photographyAlertsTable).where(and(eq(photographyAlertsTable.photographerId, ids[0]), eq(photographyAlertsTable.kind, "cancellation_repeat")));
  assert.ok(alert);
  await db.update(photographyCancellationsTable).set({ createdAt: new Date(Date.now() - 31 * 86400000) }).where(eq(photographyCancellationsTable.photographerId, ids[0]));
  assert.equal((await recentCancellationCounts()).get(ids[0]) ?? 0, 0);
});
test("delivery and review require the assigned photographer, owner identity and finished session", async () => {
  const future = await booking();
  await assert.rejects(() => deliverPhotography(future.id, ids[0]), /delivery_unavailable/);
  await assert.rejects(() => declinePhotography(future.id, ids[1], { reason: "other" }), /booking_unavailable/);
  await assert.rejects(() => ratePhotography(future.id, [ownerId], { stars: 5 }), /rating_unavailable/);
  const past = await booking(ids[0], { startAt: new Date(Date.now() - 7200000), endAt: new Date(Date.now() - 3600000) });
  await assert.rejects(() => deliverPhotography(past.id, ids[1]), /delivery_unavailable/);
  const delivered = await deliverPhotography(past.id, ids[0]);
  assert.equal(delivered.booking.status, "completed");
  assert.ok(delivered.booking.deliveredAt);
  await assert.rejects(() => ratePhotography(past.id, ["wrong-owner"], { stars: 1 }), /rating_unavailable/);
  await ratePhotography(past.id, [ownerId], { stars: 1, comment: "PhotoOps quality test" });
  await assert.rejects(() => ratePhotography(past.id, [ownerId], { stars: 5 }), /already_rated/);
  const [p] = await db.select().from(photographersTable).where(eq(photographersTable.id, ids[0]));
  assert.equal(qualityEligible(p), false);
  const [alert] = await db.select().from(photographyAlertsTable).where(eq(photographyAlertsTable.dedupeKey, `quality:${ids[0]}`));
  assert.equal(alert.kind, "quality");
  assert.equal(await allocateAndHold(new Date(+start + 86400000)), ids[1]);
  assert.equal((await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, future.id)))[0].status, "confirmed");
});
test("exact replacement intervals do not have to match the new photographer's slot grid", () => {
  const at = new Date(`${date}T10:30:00+03:00`);
  assert.equal(canCoverExactInterval({ availability, blockedDates: [] }, at, new Date(+at + 3600000), []), true);
  assert.equal(canCoverExactInterval({ availability, blockedDates: [date] }, at, new Date(+at + 3600000), []), false);
});
