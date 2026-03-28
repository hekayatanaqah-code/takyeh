import { Router } from "express";
import { db } from "@workspace/db";
import { chaletSubmissionsTable } from "@workspace/db/schema";
import { CreateSubmissionBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
  }

  const submissions = await db
    .select()
    .from(chaletSubmissionsTable)
    .where(eq(chaletSubmissionsTable.ownerId, req.user.id));

  return res.json(submissions);
});

router.post("/", async (req, res) => {
  const result = CreateSubmissionBody.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "بيانات غير صحيحة" });
  }

  const data = result.data;
  const ownerId = req.isAuthenticated() ? req.user.id : null;

  const [submission] = await db
    .insert(chaletSubmissionsTable)
    .values({
      ownerId,
      nameAr: data.nameAr,
      whatsappNumber: data.whatsappNumber,
      location: data.location,
      websiteUrl: data.websiteUrl ?? null,
      descriptionAr: data.descriptionAr,
      pricePerNight: String(data.pricePerNight),
      photos: data.photos ?? [],
    })
    .returning({ id: chaletSubmissionsTable.id });

  return res.status(201).json({
    id: submission.id,
    message: "تم استلام بياناتك بنجاح، سيتم مراجعة الشاليه ونشره قريباً",
  });
});

export default router;
