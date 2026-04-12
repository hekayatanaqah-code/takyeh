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
  // Storage paths are relative (/api/storage/...), not full URLs,
  // so we validate them as non-empty strings — not with .url()
  const schema = z.object({
    businessName: z.string().min(2, "اسم النشاط يجب أن يكون حرفين على الأقل"),
    category: z.string().min(1, "يرجى اختيار فئة الخدمة"),
    city: z.string().min(1, "يرجى اختيار المدينة"),
    descriptionAr: z.string().optional(),
    whatsappNumber: z.string().min(9, "رقم الواتساب يجب أن يكون 9 أرقام على الأقل"),
    logoUrl: z.string().min(1).optional().or(z.literal("")),
    galleryPhotos: z
      .array(z.string().min(1))
      .min(3, "يجب رفع 3 صور على الأقل للمعرض"),
    videoUrl: z.string().min(1).optional().or(z.literal("")),
    yearsOfExperience: z.number().int().min(0).optional(),
    coverageTags: z.array(z.string()).min(1, "يرجى إضافة نطاق الخدمة").default([]),
    customFeatureTags: z.array(z.string()).default([]),
  });

  const parsed = schema.safeParse(req.body);

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
      fieldErrors[field] = (msgs as string[])[0] ?? "خطأ في البيانات";
    }
    return res.status(422).json({ error: "بيانات غير صحيحة", fieldErrors });
  }

  const data = parsed.data;

  // Clean up empty strings from optional URL fields
  const values = {
    ownerId: req.user.id,
    businessName: data.businessName,
    category: data.category,
    city: data.city,
    descriptionAr: data.descriptionAr ?? null,
    whatsappNumber: data.whatsappNumber,
    logoUrl: data.logoUrl || null,
    galleryPhotos: data.galleryPhotos,
    videoUrl: data.videoUrl || null,
    yearsOfExperience: data.yearsOfExperience ?? null,
    coverageTags: data.coverageTags,
    customFeatureTags: data.customFeatureTags,
  };

  const [row] = await db
    .insert(serviceProviderSubmissionsTable)
    .values(values)
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

/* ── Owner: delete own pending submission ─────────── */
router.delete("/my/submissions/:id", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [sub] = await db
    .select()
    .from(serviceProviderSubmissionsTable)
    .where(eq(serviceProviderSubmissionsTable.id, id))
    .limit(1);
  if (!sub || sub.ownerId !== req.user.id) {
    return res.status(404).json({ error: "الطلب غير موجود" });
  }
  if (sub.status === "approved") {
    return res.status(400).json({ error: "لا يمكن حذف طلب معتمد. تواصل مع الدعم." });
  }
  await db.delete(serviceProviderSubmissionsTable).where(eq(serviceProviderSubmissionsTable.id, id));
  return res.json({ ok: true });
});

/* ── Owner: my approved provider listings ─────────── */
router.get("/my/approved", requireAuth, async (req: any, res) => {
  const rows = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.ownerId, req.user.id))
    .orderBy(serviceProvidersTable.createdAt);
  return res.json(rows.reverse());
});

/* ── Owner: toggle active for approved provider ───── */
router.patch("/my/approved/:id/toggle", requireAuth, async (req: any, res) => {
  const id = Number(req.params.id);
  const [provider] = await db
    .select()
    .from(serviceProvidersTable)
    .where(eq(serviceProvidersTable.id, id))
    .limit(1);
  if (!provider || provider.ownerId !== req.user.id) {
    return res.status(404).json({ error: "المزود غير موجود" });
  }
  const [updated] = await db
    .update(serviceProvidersTable)
    .set({ isActive: !provider.isActive })
    .where(eq(serviceProvidersTable.id, id))
    .returning();
  return res.json({ isActive: updated.isActive });
});

/* ── Public: request new city from admin ──────────── */
router.post("/city-request", requireAuth, async (req: any, res) => {
  const city = typeof req.body.city === "string" ? req.body.city.trim() : "";
  if (!city || city.length < 2) {
    return res.status(400).json({ error: "اسم المدينة مطلوب" });
  }
  // Store as an admin site setting so admin can see it
  try {
    const { siteSettingsTable } = await import("@workspace/db/schema");
    const key = `city_request_${Date.now()}`;
    await db.insert(siteSettingsTable).values({ key, value: `${city} (طلب من: ${req.user.id})` });
  } catch {
    // non-critical — just acknowledge
  }
  return res.json({ ok: true, message: `تم إرسال طلب إضافة مدينة "${city}" للإدارة` });
});

export default router;
