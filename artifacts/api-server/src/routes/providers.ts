import { Router, Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import {
  serviceProviderSubmissionsTable,
  serviceProvidersTable,
} from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";

const router = Router();

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }
  return next();
}

/* ── Public: list approved providers ─────────────── */
router.get("/", async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const conditions = [eq(serviceProvidersTable.isActive, true)] as ReturnType<typeof eq>[];
  if (category && category !== "all") {
    conditions.push(eq(serviceProvidersTable.category, category));
  }
  const rows = await db
    .select()
    .from(serviceProvidersTable)
    .where(and(...conditions))
    .orderBy(serviceProvidersTable.createdAt);
  return res.json(rows.reverse());
});

/* ── Public: single provider ──────────────────────── */
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [provider] = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.id, id));

  if (!provider) return res.status(404).json({ error: "مزود الخدمة غير موجود" });
  return res.json(provider);
});

/* ── Owner: submit new provider application ────────── */
router.post("/submit", requireAuth, async (req: any, res) => {
  const body = z.object({
    businessName: z.string().min(2),
    category: z.string().min(1),
    city: z.string().min(1),
    descriptionAr: z.string().optional(),
    whatsappNumber: z.string().min(9),
    logoUrl: z.string().url().optional(),
    galleryPhotos: z.array(z.string().url()).min(3, "يجب رفع 3 صور على الأقل"),
    videoUrl: z.string().url().optional(),
    yearsOfExperience: z.number().int().min(0).optional(),
    coverageTags: z.array(z.string()).default([]),
    customFeatureTags: z.array(z.string()).default([]),
  }).safeParse(req.body);

  if (!body.success) {
    return res.status(400).json({ error: "بيانات غير صحيحة", details: body.error.flatten() });
  }

  const [row] = await db
    .insert(serviceProviderSubmissionsTable)
    .values({ ownerId: req.user.id, ...body.data })
    .returning();

  return res.status(201).json(row);
});

/* ── Owner: my submissions ─────────────────────────── */
router.get("/my/submissions", requireAuth, async (req: any, res) => {
  const rows = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(eq(serviceProviderSubmissionsTable.ownerId, req.user.id))
    .orderBy(serviceProviderSubmissionsTable.createdAt);
  return res.json(rows.reverse());
});

export default router;
