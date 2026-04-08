import { Router } from "express";
import { db } from "@workspace/db";
import {
  reviewInvitationsTable,
  reviewsTable,
  chaletsTable,
  chaletSubmissionsTable,
} from "@workspace/db/schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod/v4";
import { requireAdmin } from "./admin";

const router = Router();

/* ── POST /admin/chalets/:id/review-invite ─────────────────────
   Admin generates a one-time review token for a chalet */
router.post("/admin/chalets/:id/review-invite", requireAdmin, async (req, res) => {
  const chaletId = parseInt(req.params.id, 10);
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

  if (!inv) return res.status(404).json({ error: "invalid_token" });
  if (inv.used) return res.status(410).json({ error: "token_used" });
  if (inv.expiresAt && inv.expiresAt < new Date())
    return res.status(410).json({ error: "token_expired" });

  const [chalet] = await db
    .select({ id: chaletsTable.id, nameAr: chaletsTable.nameAr, photos: chaletsTable.photos })
    .from(chaletsTable)
    .where(eq(chaletsTable.id, inv.chaletId))
    .limit(1);

  if (!chalet) return res.status(404).json({ error: "chalet_not_found" });

  return res.json({ chaletId: chalet.id, chaletName: chalet.nameAr, chaletPhoto: chalet.photos[0] ?? null });
});

/* ── POST /reviews/:token ──────────────────────────────────────
   Public: submit a review. Auto-published, invalidates token. */
router.post("/reviews/:token", async (req, res) => {
  const { token } = req.params;

  const bodySchema = z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().max(2000).optional(),
    photoUrls: z.array(z.string()).max(5).optional(),
  });
  const body = bodySchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "validation", issues: body.error.issues });

  const [inv] = await db
    .select()
    .from(reviewInvitationsTable)
    .where(eq(reviewInvitationsTable.token, token))
    .limit(1);

  if (!inv) return res.status(404).json({ error: "invalid_token" });
  if (inv.used) return res.status(410).json({ error: "token_used" });
  if (inv.expiresAt && inv.expiresAt < new Date())
    return res.status(410).json({ error: "token_expired" });

  await db.transaction(async (tx) => {
    await tx.insert(reviewsTable).values({
      chaletId: inv.chaletId,
      invitationId: inv.id,
      rating: body.data.rating,
      comment: body.data.comment ?? null,
      photoUrls: body.data.photoUrls ?? [],
      isVerified: true,
      isHidden: false,
    });
    await tx
      .update(reviewInvitationsTable)
      .set({ used: true })
      .where(eq(reviewInvitationsTable.id, inv.id));
  });

  return res.json({ success: true });
});

/* ── GET /chalets/:id/reviews ──────────────────────────────────
   Public: return visible (non-hidden) reviews newest first */
router.get("/chalets/:id/reviews", async (req, res) => {
  const chaletId = parseInt(req.params.id, 10);
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
router.get("/admin/reviews", requireAdmin, async (req, res) => {
  const rows = await db
    .select({
      id: reviewsTable.id,
      chaletId: reviewsTable.chaletId,
      chaletName: chaletsTable.nameAr,
      rating: reviewsTable.rating,
      comment: reviewsTable.comment,
      photoUrls: reviewsTable.photoUrls,
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
router.get("/admin/review-invitations", requireAdmin, async (req, res) => {
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
router.patch("/admin/reviews/:id", requireAdmin, async (req, res) => {
  const reviewId = parseInt(req.params.id, 10);
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

/* ── DELETE /admin/reviews/:id ─────────────────────────────────
   Admin: permanently delete a review */
router.delete("/admin/reviews/:id", requireAdmin, async (req, res) => {
  const reviewId = parseInt(req.params.id, 10);
  if (isNaN(reviewId)) return res.status(400).json({ error: "invalid id" });

  const [deleted] = await db
    .delete(reviewsTable)
    .where(eq(reviewsTable.id, reviewId))
    .returning({ id: reviewsTable.id });

  if (!deleted) return res.status(404).json({ error: "not found" });
  return res.json({ ok: true });
});

export default router;
