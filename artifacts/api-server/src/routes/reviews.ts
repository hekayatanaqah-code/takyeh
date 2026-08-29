import { Router } from "express";
import { db } from "@workspace/db";
import {
  reviewInvitationsTable,
  reviewsTable,
  chaletsTable,
  chaletSubmissionsTable,
  ownerNotificationsTable,
  ownerBookingsTable,
  ownerNotificationSettingsTable,
  serviceReviewInvitationsTable,
  serviceReviewsTable,
  serviceProvidersTable,
} from "@workspace/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod/v4";
import { requireAdmin, requireAdminOrAdminStaff, requireSuperAdmin } from "./admin";

const router = Router();

function getRouteParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

/* ── POST /admin/chalets/:id/review-invite ─────────────────────
   Admin generates a one-time review token for a chalet */
router.post("/admin/chalets/:id/review-invite", requireAdminOrAdminStaff, async (req, res) => {
  const chaletId = parseInt(getRouteParam(req.params.id), 10);
  if (isNaN(chaletId)) return res.status(400).json({ error: "invalid id" });

  const [chalet] = await db
    .select({ id: chaletsTable.id, nameAr: chaletsTable.nameAr })
    .from(chaletsTable)
    .where(eq(chaletsTable.id, chaletId))
    .limit(1);

  if (!chalet) return res.status(404).json({ error: "not found" });

  const token = randomBytes(5).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  const [inv] = await db
    .insert(reviewInvitationsTable)
    .values({ token, chaletId, expiresAt })
    .returning();

  return res.json({ token: inv.token, chaletId, chaletName: chalet.nameAr });
});

/* ── GET /reviews/:token ───────────────────────────────────────
   Public: resolve token → return chalet info for the review page */
router.get("/reviews/:token", async (req, res) => {
  const { token } = req.params;
  const [inv] = await db
    .select()
    .from(reviewInvitationsTable)
    .where(eq(reviewInvitationsTable.token, token))
    .limit(1);

  if (!inv) {
    const [serviceInv] = await db.select().from(serviceReviewInvitationsTable)
      .where(eq(serviceReviewInvitationsTable.token, token)).limit(1);
    if (!serviceInv) return res.status(404).json({ error: "invalid_token" });
    if (serviceInv.used) return res.status(410).json({ error: "token_used" });
    if (serviceInv.expiresAt && serviceInv.expiresAt < new Date()) return res.status(410).json({ error: "token_expired" });
    const [provider] = await db.select({
      id: serviceProvidersTable.id,
      businessName: serviceProvidersTable.businessName,
      logoUrl: serviceProvidersTable.logoUrl,
    }).from(serviceProvidersTable).where(eq(serviceProvidersTable.id, serviceInv.providerId)).limit(1);
    if (!provider) return res.status(404).json({ error: "provider_not_found" });
    return res.json({
      chaletId: provider.id,
      chaletName: provider.businessName,
      chaletPhoto: provider.logoUrl ?? null,
      guestName: serviceInv.guestName ?? null,
      resourceType: "service",
    });
  }
  if (inv.used) return res.status(410).json({ error: "token_used" });
  if (inv.expiresAt && inv.expiresAt < new Date())
    return res.status(410).json({ error: "token_expired" });

  const [chalet] = await db
    .select({ id: chaletsTable.id, nameAr: chaletsTable.nameAr, photos: chaletsTable.photos })
    .from(chaletsTable)
    .where(eq(chaletsTable.id, inv.chaletId))
    .limit(1);

  if (!chalet) return res.status(404).json({ error: "chalet_not_found" });

  return res.json({ chaletId: chalet.id, chaletName: chalet.nameAr, chaletPhoto: chalet.photos[0] ?? null, guestName: inv.guestName ?? null });
});

/* ── POST /reviews/:token ──────────────────────────────────────
   Public: submit a review. Auto-publishes and notifies the chalet owner. */
router.post("/reviews/:token", async (req, res) => {
  const { token } = req.params;

  const bodySchema = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
    photoUrls: z.array(z.string()).max(5).optional(),
    isAnonymous: z.boolean().optional().default(false),
  });
  const body = bodySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation", issues: body.error.issues });

  const [inv] = await db
    .select()
    .from(reviewInvitationsTable)
    .where(eq(reviewInvitationsTable.token, token))
    .limit(1);

  if (!inv) {
    const [serviceInv] = await db.select().from(serviceReviewInvitationsTable)
      .where(eq(serviceReviewInvitationsTable.token, token)).limit(1);
    if (!serviceInv) return res.status(404).json({ error: "invalid_token" });
    if (serviceInv.used) return res.status(410).json({ error: "token_used" });
    if (serviceInv.expiresAt && serviceInv.expiresAt < new Date()) return res.status(410).json({ error: "token_expired" });
    const [provider] = await db.select().from(serviceProvidersTable)
      .where(eq(serviceProvidersTable.id, serviceInv.providerId)).limit(1);
    if (!provider) return res.status(404).json({ error: "provider_not_found" });
    const submitted = await db.transaction(async (tx) => {
      const [claimed] = await tx.update(serviceReviewInvitationsTable)
        .set({ used: true })
        .where(and(
          eq(serviceReviewInvitationsTable.id, serviceInv.id),
          eq(serviceReviewInvitationsTable.used, false),
        ))
        .returning({ id: serviceReviewInvitationsTable.id });
      if (!claimed) return false;

      await tx.insert(serviceReviewsTable).values({
        providerId: serviceInv.providerId,
        invitationId: serviceInv.id,
        rating: body.data.rating,
        comment: body.data.comment ?? null,
        photoUrls: body.data.photoUrls ?? [],
        guestName: serviceInv.guestName ?? null,
        isAnonymous: body.data.isAnonymous ?? false,
      });
      if (provider.ownerId) {
        const stars = "★".repeat(body.data.rating) + "☆".repeat(5 - body.data.rating);
        await tx.insert(ownerNotificationsTable).values({
          ownerId: provider.ownerId,
          type: "new_review",
          message: `تقييم جديد لخدمة ${provider.businessName} — ${stars}`,
        });
      }
      return true;
    });
    if (!submitted) return res.status(410).json({ error: "token_used" });
    return res.json({ success: true });
  }
  if (inv.used) return res.status(410).json({ error: "token_used" });
  if (inv.expiresAt && inv.expiresAt < new Date())
    return res.status(410).json({ error: "token_expired" });

  /* Fetch chalet + owner ID via submission (ownerId lives in submissions, not chaletsTable) */
  const [chaletRow] = await db
    .select({
      id: chaletsTable.id,
      nameAr: chaletsTable.nameAr,
      submissionId: chaletsTable.submissionId,
    })
    .from(chaletsTable)
    .where(eq(chaletsTable.id, inv.chaletId))
    .limit(1);

  let chaletOwnerId: string | null = null;
  if (chaletRow?.submissionId) {
    const [sub] = await db
      .select({ ownerId: chaletSubmissionsTable.ownerId })
      .from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, chaletRow.submissionId))
      .limit(1);
    chaletOwnerId = sub?.ownerId ?? null;
  }

  // Pre-fetch WA settings for the owner (outside the transaction)
  let waSetting: { waEnabled: boolean; waPhone: string | null } | null = null;
  if (chaletOwnerId) {
    const [ws] = await db
      .select({ waEnabled: ownerNotificationSettingsTable.waEnabled, waPhone: ownerNotificationSettingsTable.waPhone })
      .from(ownerNotificationSettingsTable)
      .where(eq(ownerNotificationSettingsTable.ownerId, chaletOwnerId))
      .limit(1);
    waSetting = ws ?? null;
  }

  await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(reviewsTable).values({
      chaletId: inv.chaletId,
      invitationId: inv.id,
      rating: body.data.rating,
      comment: body.data.comment ?? null,
      photoUrls: body.data.photoUrls ?? [],
      guestName: inv.guestName ?? null,
      isAnonymous: body.data.isAnonymous ?? false,
      isVerified: true,
      isHidden: false,
    }).returning({ id: reviewsTable.id });

    await tx
      .update(reviewInvitationsTable)
      .set({ used: true })
      .where(eq(reviewInvitationsTable.id, inv.id));

    /* Mark the linked booking as rated */
    if (inv.bookingId) {
      await tx
        .update(ownerBookingsTable)
        .set({ ratedAt: new Date() })
        .where(eq(ownerBookingsTable.id, inv.bookingId));
    }

    /* Notify the chalet owner */
    if (chaletOwnerId) {
      const stars = "★".repeat(body.data.rating) + "☆".repeat(5 - body.data.rating);
      const chaletName = chaletRow?.nameAr ?? "شاليهك";
      let msg = `تقييم جديد لـ${chaletName} — ${stars}${body.data.comment ? ` — "${body.data.comment.slice(0, 60)}${body.data.comment.length > 60 ? "..." : ""}"` : ""}`;
      if (waSetting?.waEnabled && waSetting.waPhone) {
        const waText = encodeURIComponent(`تقييم جديد في ${chaletName}:\nالتقييم: ${stars}\n${body.data.comment ? `التعليق: ${body.data.comment.slice(0, 100)}` : ""}`);
        msg += ` | wa.me/${waSetting.waPhone}?text=${waText}`;
      }
      await tx.insert(ownerNotificationsTable).values({
        ownerId: chaletOwnerId,
        type: "new_review",
        chaletId: inv.chaletId,
        reviewId: inserted.id,
        message: msg,
      });
    }
  });

  return res.json({ success: true });
});

/* ── GET /chalets/:id/reviews ──────────────────────────────────
   Public: return visible (non-hidden) reviews newest first */
router.get("/chalets/:id/reviews", async (req, res) => {
  const chaletId = parseInt(getRouteParam(req.params.id), 10);
  if (isNaN(chaletId)) return res.status(400).json({ error: "invalid id" });

  const rows = await db
    .select()
    .from(reviewsTable)
    .where(and(eq(reviewsTable.chaletId, chaletId), eq(reviewsTable.isHidden, false)))
    .orderBy(desc(reviewsTable.createdAt));

  return res.json(rows);
});

/* ── GET /admin/reviews ────────────────────────────────────────
   Admin: all reviews across all chalets (including hidden + reported) */
router.get("/admin/reviews", requireAdminOrAdminStaff, async (req, res) => {
  const rows = await db
    .select({
      id: reviewsTable.id,
      chaletId: reviewsTable.chaletId,
      chaletName: chaletsTable.nameAr,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      photoUrls: reviewsTable.photoUrls,
      guestName: reviewsTable.guestName,
      isAnonymous: reviewsTable.isAnonymous,
      isVerified: reviewsTable.isVerified,
      isHidden: reviewsTable.isHidden,
      ownerReply: reviewsTable.ownerReply,
      ownerReplyAt: reviewsTable.ownerReplyAt,
      reportedBy: reviewsTable.reportedBy,
      reportedAt: reviewsTable.reportedAt,
      reportReason: reviewsTable.reportReason,
      createdAt: reviewsTable.createdAt,
    })
    .from(reviewsTable)
    .leftJoin(chaletsTable, eq(reviewsTable.chaletId, chaletsTable.id))
    .orderBy(desc(reviewsTable.createdAt));

  return res.json(rows);
});

/* ── GET /admin/review-invitations ────────────────────────────
   Admin: list all invitations with chalet name */
router.get("/admin/review-invitations", requireAdminOrAdminStaff, async (req, res) => {
  const rows = await db
    .select({
      id: reviewInvitationsTable.id,
      token: reviewInvitationsTable.token,
      chaletId: reviewInvitationsTable.chaletId,
      chaletName: chaletsTable.nameAr,
      used: reviewInvitationsTable.used,
      expiresAt: reviewInvitationsTable.expiresAt,
      createdAt: reviewInvitationsTable.createdAt,
    })
    .from(reviewInvitationsTable)
    .leftJoin(chaletsTable, eq(reviewInvitationsTable.chaletId, chaletsTable.id))
    .orderBy(desc(reviewInvitationsTable.createdAt));

  return res.json(rows);
});

/* ── PATCH /admin/reviews/:id ──────────────────────────────────
   Admin: hide or show a review */
router.patch("/admin/reviews/:id", requireAdminOrAdminStaff, async (req, res) => {
  const reviewId = parseInt(getRouteParam(req.params.id), 10);
  if (isNaN(reviewId)) return res.status(400).json({ error: "invalid id" });

  const body = z.object({ isHidden: z.boolean() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation" });

  const [updated] = await db
    .update(reviewsTable)
    .set({ isHidden: body.data.isHidden })
    .where(eq(reviewsTable.id, reviewId))
    .returning({ id: reviewsTable.id });

  if (!updated) return res.status(404).json({ error: "not found" });
  return res.json({ ok: true });
});

/* ── POST /admin/reviews/:id/dismiss-report ────────────────────
   Admin: dismiss the owner's report without deleting the review.
   Also sends a "report dismissed" notification to the owner. */
router.post("/admin/reviews/:id/dismiss-report", requireAdminOrAdminStaff, async (req, res) => {
  const reviewId = parseInt(getRouteParam(req.params.id), 10);
  if (isNaN(reviewId)) return res.status(400).json({ error: "invalid id" });

  const [review] = await db
    .select({
      id: reviewsTable.id,
      chaletId: reviewsTable.chaletId,
      reportedBy: reviewsTable.reportedBy,
    })
    .from(reviewsTable)
    .where(eq(reviewsTable.id, reviewId))
    .limit(1);

  if (!review) return res.status(404).json({ error: "not found" });

  await db.transaction(async (tx) => {
    await tx
      .update(reviewsTable)
      .set({ reportedBy: null, reportedAt: null, reportReason: null })
      .where(eq(reviewsTable.id, reviewId));

    /* Notify the owner who submitted the report */
    if (review.reportedBy) {
      const [chalet] = await tx
        .select({ nameAr: chaletsTable.nameAr })
        .from(chaletsTable)
        .where(eq(chaletsTable.id, review.chaletId))
        .limit(1);

      await tx.insert(ownerNotificationsTable).values({
        ownerId: review.reportedBy,
        type: "report_dismissed",
        chaletId: review.chaletId,
        reviewId: reviewId,
        message: `تم رفض بلاغك على تقييم شاليه "${chalet?.nameAr ?? ""}" من قبل الإدارة — التقييم سيبقى منشوراً.`,
      });
    }
  });

  return res.json({ ok: true });
});

/* ── DELETE /admin/reviews/:id ─────────────────────────────────
   Admin: permanently delete a review */
router.delete("/admin/reviews/:id", requireAdminOrAdminStaff, async (req, res) => {
  const reviewId = parseInt(getRouteParam(req.params.id), 10);
  if (isNaN(reviewId)) return res.status(400).json({ error: "invalid id" });

  const [deleted] = await db
    .delete(reviewsTable)
    .where(eq(reviewsTable.id, reviewId))
    .returning({ id: reviewsTable.id });

  if (!deleted) return res.status(404).json({ error: "not found" });
  return res.json({ ok: true });
});

export default router;
