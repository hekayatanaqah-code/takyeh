import { db, photographersTable, photographyBookingsTable, photographyCancellationsTable } from "@workspace/db";
import { lockResource } from "@workspace/db/transaction-lock";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { coveredPhotographyTarget, type PhotographyTarget } from "./photography-targets";
import { photographySlots } from "./photography-rules";
import { photographyPolicy, qualityEligible, rotationWeight, roundRobinTurn } from "./photography-allocation-policy";
import { getPhotographyPolicy } from "./photography-policy-settings";
import { packageEligible, photographyCityCovered } from "./photography-qualifications";

export type PhotographyTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Store = Pick<typeof db, "select">;
type Photographer = typeof photographersTable.$inferSelect;
export async function lockPhotographyAllocation(tx: PhotographyTx) {
  // One ordering lock across allocations, paid confirmation, ratings and declines.
  await lockResource(tx, 731226, 1);
}
export async function recentCancellationCounts(store: Store = db) {
  const policy = await getPhotographyPolicy(store);
  const rows = await store.select({
    id: photographyCancellationsTable.photographerId,
    count: sql<number>`count(*)`.mapWith(Number),
  }).from(photographyCancellationsTable)
    .where(gte(photographyCancellationsTable.createdAt, new Date(Date.now() - policy.cancellationWindowDays * 86400000)))
    .groupBy(photographyCancellationsTable.photographerId);
  return new Map(rows.map(r => [r.id, r.count]));
}
export async function photographyBusyIntervals(ids: number[], store: Store = db) {
  if (!ids.length) return [];
  return store.select({
    photographerId: photographyBookingsTable.photographerId,
    startAt: photographyBookingsTable.startAt, endAt: photographyBookingsTable.endAt,
  }).from(photographyBookingsTable).where(and(
    inArray(photographyBookingsTable.photographerId, ids),
    eq(photographyBookingsTable.assignmentStatus, "assigned"),
    sql`(${photographyBookingsTable.status} IN ('confirmed','completed','payment_review')
      OR (${photographyBookingsTable.status} = 'awaiting_payment'
        AND (${photographyBookingsTable.invoiceId} IS NOT NULL OR ${photographyBookingsTable.expiresAt} > now())))`,
  ));
}
export function canCoverExactInterval(
  p: Pick<Photographer, "availability" | "blockedDates">, start: Date, end: Date,
  busy: { startAt: Date; endAt: Date }[], now = new Date(),
) {
  if (+start <= +now || +end <= +start || +start > +now + 90 * 86400000) return false;
  const local = new Date(+start + 3 * 3600000);
  const day = local.toISOString().slice(0, 10);
  if (p.blockedDates.includes(day) || new Date(+end - 1 + 3 * 3600000).toISOString().slice(0, 10) !== day) return false;
  const startMinute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const endMinute = startMinute + (+end - +start) / 60000;
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  return p.availability.some(a => a.weekday === local.getUTCDay() && minutes(a.start) <= startMinute && minutes(a.end) >= endMinute)
    && !busy.some(b => +b.startAt < +end && +b.endAt > +start);
}

export async function photographyUnionSlots(target: PhotographyTarget, date: string, packageId?: number) {
  if (!packageId || !await photographyCityCovered(target)) return [];
  const policy = await getPhotographyPolicy();
  const people = await db.select().from(photographersTable).where(eq(photographersTable.status, "approved"));
  const busy = await photographyBusyIntervals(people.map(p => p.id));
  const slots = new Map<string, { startAt: string; endAt: string }>();
  for (const p of people) {
    if (!qualityEligible(p, policy) || !await packageEligible(p, packageId, target.typeKey) || !await coveredPhotographyTarget(target, p)) continue;
    for (const s of photographySlots(date, p.sessionMinutes, p.availability, busy.filter(b => b.photographerId === p.id), new Date(), p.blockedDates)) {
      slots.set(`${s.startAt}/${s.endAt}`, s);
    }
  }
  return [...slots.values()].sort((a, b) => a.startAt.localeCompare(b.startAt) || a.endAt.localeCompare(b.endAt));
}

/** Caller holds the allocation lock. Requested identities are never trusted. */
export async function allocatePhotography(
  tx: PhotographyTx, target: PhotographyTarget, start: Date, options: { endAt?: Date; replacement?: boolean; excludedIds?: number[]; packageId?: number } = {},
) {
  if (!options.packageId || (!options.replacement && !await photographyCityCovered(target, tx))) return null;
  const policy = await getPhotographyPolicy(tx);
  const people = await tx.select().from(photographersTable).where(eq(photographersTable.status, "approved")).orderBy(photographersTable.id).for("update");
  const busy = await photographyBusyIntervals(people.map(p => p.id), tx);
  const counts = await recentCancellationCounts(tx);
  const date = new Date(+start + 3 * 3600000).toISOString().slice(0, 10);
  const candidates: (Photographer & { weight: number; selectedEnd: Date })[] = [];
  for (const p of people) {
    if (options.excludedIds?.includes(p.id) || !qualityEligible(p, policy) || !await packageEligible(p, options.packageId, target.typeKey, tx, options.replacement) || !await coveredPhotographyTarget(target, p, tx)) continue;
    const occupied = busy.filter(b => b.photographerId === p.id);
    let end: Date | undefined;
    if (options.replacement && options.endAt) {
      if (canCoverExactInterval(p, start, options.endAt, occupied)) end = options.endAt;
    } else {
      const slot = photographySlots(date, p.sessionMinutes, p.availability, occupied, new Date(), p.blockedDates)
        .find(s => s.startAt === start.toISOString() && (!options.endAt || s.endAt === options.endAt.toISOString()));
      if (slot) end = new Date(slot.endAt);
    }
    if (end) candidates.push({ ...p, selectedEnd: end, weight: rotationWeight(p.confirmedAssignments, counts.get(p.id) ?? 0, policy) });
  }
  const turn = roundRobinTurn(candidates);
  if (!turn) return null;
  for (const credit of turn.credits) {
    await tx.update(photographersTable).set({
      rotationCredit: credit.credit, ...(credit.id === turn.winner.id ? { lastAssignedAt: new Date() } : {}),
    }).where(eq(photographersTable.id, credit.id));
  }
  return { photographer: turn.winner, endAt: turn.winner.selectedEnd };
}
