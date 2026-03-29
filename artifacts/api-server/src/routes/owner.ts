import { Router } from "express";
import { db } from "@workspace/db";
import { ownerBookingsTable, chaletSubmissionsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import type { Request, Response, NextFunction } from "express";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
    return;
  }
  next();
}

router.use(requireAuth);

router.get("/bookings", async (req, res) => {
  const ownerId = req.user!.id;
  const rows = await db
    .select()
    .from(ownerBookingsTable)
    .where(eq(ownerBookingsTable.ownerId, ownerId))
    .orderBy(ownerBookingsTable.createdAt);
  return res.json(rows.reverse());
});

router.post("/bookings", async (req, res) => {
  const ownerId = req.user!.id;
  const body = z.object({
    submissionId: z.number().int().positive().optional(),
    clientName: z.string().min(1),
    bookingDate: z.string().min(1),
    durationDays: z.number().int().min(1).default(1),
    source: z.enum(["platform", "external"]).default("platform"),
    notes: z.string().optional(),
  }).safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: "بيانات غير صحيحة" });

  if (body.data.submissionId) {
    const [sub] = await db
      .select({ ownerId: chaletSubmissionsTable.ownerId })
      .from(chaletSubmissionsTable)
      .where(eq(chaletSubmissionsTable.id, body.data.submissionId));
    if (!sub || sub.ownerId !== ownerId) {
      return res.status(403).json({ error: "غير مصرح" });
    }
  }

  const [booking] = await db
    .insert(ownerBookingsTable)
    .values({ ...body.data, ownerId })
    .returning();

  return res.status(201).json(booking);
});

router.delete("/bookings/:id", async (req, res) => {
  const ownerId = req.user!.id;
  const id = Number(req.params.id);
  await db
    .delete(ownerBookingsTable)
    .where(and(eq(ownerBookingsTable.id, id), eq(ownerBookingsTable.ownerId, ownerId)));
  return res.json({ ok: true });
});

export default router;
