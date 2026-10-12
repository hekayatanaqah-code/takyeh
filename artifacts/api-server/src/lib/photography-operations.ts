import {
  db, photographersTable, photographyBookingsTable, photographyReviewsTable,
  photographyCancellationsTable, photographyAlertsTable, photographyDeliveriesTable, ownerNotificationsTable,
} from "@workspace/db";
import { and, eq, desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { ownedPhotographyTarget, type PhotographyTarget } from "./photography-targets";
import { allocatePhotography, lockPhotographyAllocation, recentCancellationCounts, type PhotographyTx } from "./photography-allocation";
import { photographyPolicy, qualityEligible } from "./photography-allocation-policy";
import { getPhotographyPolicy } from "./photography-policy-settings";
import { publishPhotographyBooking } from "./photography-events";
import { deliverPhotographyMessage } from "./photography-delivery";
import { logger } from "./logger";

export const photographyDeclineSchema = z.object({
  reason: z.enum(["emergency", "equipment", "personal", "other"]),
  details: z.string().trim().max(2000).optional(),
}).strict();
export const photographyRatingSchema = z.object({
  stars: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional(),
}).strict();
type Booking = typeof photographyBookingsTable.$inferSelect;

async function alert(tx: PhotographyTx, input: {
  dedupeKey: string; kind: string; photographerId: number; bookingId?: number; message: string;
}) {
  await tx.insert(photographyAlertsTable).values(input).onConflictDoUpdate({
    target: photographyAlertsTable.dedupeKey,
    set: { message: input.message, photographerId: input.photographerId, resolvedAt: null, readAt: null, createdAt: new Date() },
  });
}
export async function photographyCancellationHistory(photographerId?: number) {
  return db.select({
    id: photographyCancellationsTable.id, bookingId: photographyCancellationsTable.bookingId,
    photographerId: photographyCancellationsTable.photographerId, reason: photographyCancellationsTable.reason,
    details: photographyCancellationsTable.details, createdAt: photographyCancellationsTable.createdAt,
    replacementPhotographerId: photographyCancellationsTable.replacementPhotographerId,
    photographerName: photographersTable.name, propertyName: photographyBookingsTable.propertyName,
    startAt: photographyBookingsTable.startAt,
  }).from(photographyCancellationsTable)
    .innerJoin(photographersTable, eq(photographersTable.id, photographyCancellationsTable.photographerId))
    .innerJoin(photographyBookingsTable, eq(photographyBookingsTable.id, photographyCancellationsTable.bookingId))
    .where(photographerId ? eq(photographyCancellationsTable.photographerId, photographerId) : undefined)
    .orderBy(desc(photographyCancellationsTable.createdAt)).limit(200);
}
async function frozenTarget(booking: Booking, tx: PhotographyTx): Promise<PhotographyTarget | null> {
  if (booking.targetCity && booking.targetRegion) return {
    id: booking.propertyId ?? booking.serviceSubmissionId!, kind: booking.propertyId ? "property" : "service",
    ownerId: booking.ownerId, nameAr: booking.propertyName, whatsappNumber: booking.ownerPhone,
    location: booking.targetCity, region: booking.targetRegion, district: booking.targetDistrict, typeKey: booking.targetType,
  };
  // Legacy sessions have no historical geography snapshot; never invent coverage.
  return ownedPhotographyTarget([booking.ownerId], booking.propertyId
    ? { propertyId: booking.propertyId } : { serviceSubmissionId: booking.serviceSubmissionId! }, tx);
}

/** Payment, interval and customer-facing booking identity are unchanged. */
async function replaceAssignedPhotographer(tx: PhotographyTx, booking: Booking) {
  const declined = await tx.select({ id: photographyCancellationsTable.photographerId })
    .from(photographyCancellationsTable).where(eq(photographyCancellationsTable.bookingId, booking.id));
  const target = await frozenTarget(booking, tx);
  const choice = target ? await allocatePhotography(tx, target, booking.startAt, {
    packageId: booking.packageId,
    endAt: booking.endAt, replacement: true, excludedIds: [...declined.map(r => r.id), booking.photographerId],
  }) : null;
  if (!choice) {
    await tx.update(photographyBookingsTable).set({ assignmentStatus: "needs_review" })
      .where(eq(photographyBookingsTable.id, booking.id));
    await alert(tx, {
      dedupeKey: `replacement:${booking.id}`, kind: "replacement_needed",
      bookingId: booking.id, photographerId: booking.photographerId,
      message: `الحجز المدفوع رقم ${booking.id} (${booking.propertyName}) يحتاج تأمين مصور بديل في الموعد نفسه. لا يتم إلغاء الحجز أو رد المبلغ تلقائياً.`,
    });
    return { reassigned: false, needsAdminReview: true, message: "سُجّل الاعتذار وأُحيل الحجز المدفوع إلى مراجعة الإدارة العاجلة لتأمين بديل." };
  }
  const p = choice.photographer;
  await tx.update(photographyBookingsTable).set({
    photographerId: p.id, photographerName: p.name, photographerPhone: p.whatsapp, assignmentStatus: "assigned",
  }).where(eq(photographyBookingsTable.id, booking.id));
  await tx.update(photographersTable).set({ confirmedAssignments: sql`${photographersTable.confirmedAssignments} + 1` })
    .where(eq(photographersTable.id, p.id));
  await tx.update(photographyCancellationsTable).set({ replacementPhotographerId: p.id }).where(and(
    eq(photographyCancellationsTable.bookingId, booking.id), eq(photographyCancellationsTable.photographerId, booking.photographerId),
  ));
  await tx.update(photographyAlertsTable).set({ resolvedAt: new Date() })
    .where(eq(photographyAlertsTable.dedupeKey, `replacement:${booking.id}`));
  // Only the replacement is notified. Never insert an owner cancellation/rebooking notice.
  const [delivery] = await tx.insert(photographyDeliveriesTable).values({
    dedupeKey: `booking:${booking.id}:photographer:${p.id}`, bookingId: booking.id, photographerId: p.id,
    recipient: p.whatsapp, kind: "booking",
    parameters: [booking.propertyName, booking.packageName, booking.startAt.toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }), String(booking.id)],
  }).onConflictDoNothing({ target: photographyDeliveriesTable.dedupeKey }).returning({ id: photographyDeliveriesTable.id });
  return { reassigned: true, needsAdminReview: false, message: "سُجّل الاعتذار وأُسند الحجز تلقائياً إلى مصور بديل في الموعد نفسه دون إشعار المالك.", replacementId: p.id, deliveryId: delivery?.id };
}

export async function declinePhotography(bookingId: number, photographerId: number, input: z.infer<typeof photographyDeclineSchema>) {
  const result = await db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    const [previous] = await tx.select().from(photographyCancellationsTable).where(and(
      eq(photographyCancellationsTable.bookingId, bookingId), eq(photographyCancellationsTable.photographerId, photographerId),
    ));
    if (previous) return {
      reassigned: !!previous.replacementPhotographerId, needsAdminReview: !previous.replacementPhotographerId,
      replacementId: previous.replacementPhotographerId, message: "هذا الاعتذار مسجل بالفعل؛ لم يتم تكراره.",
    };
    const [booking] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, bookingId)).for("update");
    if (!booking || booking.photographerId !== photographerId || booking.status !== "confirmed" || booking.assignmentStatus !== "assigned") throw new Error("booking_unavailable");
    await tx.insert(photographyCancellationsTable).values({ bookingId, photographerId, reason: input.reason, details: input.details ?? "" });
    await tx.update(photographyDeliveriesTable).set({ status: "superseded", error: "المصور اعتذر عن الجلسة" }).where(and(
      eq(photographyDeliveriesTable.bookingId, bookingId),
      sql`(${photographyDeliveriesTable.photographerId} = ${photographerId}
        OR (${photographyDeliveriesTable.photographerId} IS NULL AND ${photographyDeliveriesTable.dedupeKey} = ${`booking:${bookingId}:photographer`}))`,
      inArray(photographyDeliveriesTable.status, ["pending", "failed", "unconfigured"]),
    ));
    const count = (await recentCancellationCounts(tx)).get(photographerId) ?? 0;
    const policy = await getPhotographyPolicy(tx);
    if (count >= policy.cancellationThreshold) await alert(tx, {
      dedupeKey: `cancellations:${photographerId}`, kind: "cancellation_repeat", photographerId,
      message: `سُجّل للمصور ${count} اعتذارات خلال آخر ${policy.cancellationWindowDays.toLocaleString("ar-SA")} يوماً. خُفّضت أولوية التناوب مؤقتاً؛ راجع الالتزام وأسباب الاعتذار والتحويلات السابقة إن وجدت.`,
    });
    return replaceAssignedPhotographer(tx, booking);
  });
  publishPhotographyBooking(photographerId, bookingId);
  if (result.replacementId) publishPhotographyBooking(result.replacementId, bookingId);
  if ("deliveryId" in result && result.deliveryId) {
    try { await deliverPhotographyMessage(result.deliveryId); }
    catch { logger.warn({ bookingId }, "Replacement assigned; photographer message deferred"); }
  }
  return result;
}
export async function retryPhotographyAssignment(bookingId: number) {
  const result = await db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    const [booking] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, bookingId)).for("update");
    if (!booking || booking.status !== "confirmed" || booking.assignmentStatus !== "needs_review") throw new Error("booking_unavailable");
    return replaceAssignedPhotographer(tx, booking);
  });
  if (result.replacementId) publishPhotographyBooking(result.replacementId, bookingId);
  if ("deliveryId" in result && result.deliveryId) {
    try { await deliverPhotographyMessage(result.deliveryId); }
    catch { logger.warn({ bookingId }, "Replacement assigned; photographer message deferred"); }
  }
  return result;
}
export async function deliverPhotography(bookingId: number, photographerId: number, delivery: { deliveryUrl?: string; files?: Booking["deliveryFiles"]; prepareFiles?: () => Promise<Booking["deliveryFiles"]> } = {}) {
  const booking = await db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    const [row] = await tx.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, bookingId)).for("update");
    if (!row || row.photographerId !== photographerId || row.assignmentStatus !== "assigned"
      || !["confirmed", "completed"].includes(row.status) || +row.endAt > Date.now()) throw new Error("delivery_unavailable");
    if (row.deliveredAt && (row.deliveryUrl || row.deliveryFiles.length)) return row;
    const files = delivery.prepareFiles ? await delivery.prepareFiles() : delivery.files ?? [];
    if (!delivery.deliveryUrl && !files.length) throw new Error("delivery_contents");
    const [updated] = await tx.update(photographyBookingsTable).set({ status: "completed", deliveredAt: row.deliveredAt ?? new Date(), deliveryUrl: delivery.deliveryUrl ?? null, deliveryFiles: files })
      .where(eq(photographyBookingsTable.id, bookingId)).returning();
    await tx.insert(ownerNotificationsTable).values({
      ownerId: row.ownerId, type: "photography_delivery",
      message: `سلّم المصور ${row.photographerName} جلسة تصوير ${row.propertyName} (حجز ${row.id}). افتح حجوزات التصوير لمراجعة الملفات وتقييم الجلسة.`,
    });
    return updated;
  });
  publishPhotographyBooking(photographerId, bookingId);
  return { booking };
}
export async function ratePhotography(bookingId: number, ownerIds: string[], input: z.infer<typeof photographyRatingSchema>) {
  const review = await db.transaction(async tx => {
    await lockPhotographyAllocation(tx);
    const [booking] = await tx.select().from(photographyBookingsTable).where(and(
      eq(photographyBookingsTable.id, bookingId), inArray(photographyBookingsTable.ownerId, ownerIds),
    )).for("update");
    if (!booking || booking.status !== "completed" || !booking.deliveredAt || booking.assignmentStatus !== "assigned") throw new Error("rating_unavailable");
    const [existing] = await tx.select().from(photographyReviewsTable).where(eq(photographyReviewsTable.bookingId, bookingId));
    if (existing) throw new Error("already_rated");
    const [saved] = await tx.insert(photographyReviewsTable).values({
      bookingId, photographerId: booking.photographerId, ownerId: booking.ownerId, stars: input.stars, comment: input.comment ?? "",
    }).returning();
    const [p] = await tx.update(photographersTable).set({
      ratingSum: sql`${photographersTable.ratingSum} + ${input.stars}`, ratingCount: sql`${photographersTable.ratingCount} + 1`,
    }).where(eq(photographersTable.id, booking.photographerId)).returning();
    const policy = await getPhotographyPolicy(tx);
    if (!qualityEligible({ ...p, status: "approved" }, policy)) await alert(tx, {
      dedupeKey: `quality:${p.id}`, kind: "quality", photographerId: p.id,
      message: `متوسط تقييم المصور ${p.name} أقل من ${policy.qualityThreshold} نجوم. استُبعد من التوزيع الآلي لحين تحسن التقييم؛ الجلسات المؤكدة السابقة لم تُلغَ.`,
    });
    else await tx.update(photographyAlertsTable).set({ resolvedAt: new Date() }).where(eq(photographyAlertsTable.dedupeKey, `quality:${p.id}`));
    return saved;
  });
  publishPhotographyBooking(review.photographerId, bookingId);
  return { review };
}
