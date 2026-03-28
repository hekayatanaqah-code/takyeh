import { Router } from "express";
import { db } from "@workspace/db";
import { chaletSubmissionsTable } from "@workspace/db/schema";
import { CreateSubmissionBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendAdminNewSubmissionEmail } from "../lib/email";

const SubmissionBodyStrict = CreateSubmissionBody.extend({
  nameAr: z.string().trim().min(2, "اسم الشاليه مطلوب"),
  location: z.string().trim().min(2, "المدينة مطلوبة"),
  descriptionAr: z.string().trim().min(10, "الوصف قصير جداً"),
  whatsappNumber: z.string().trim().min(9, "رقم واتساب غير صحيح"),
  pricePerNight: z.number().positive("يجب أن يكون السعر أكبر من صفر"),
  mapsUrl: z.string().url().optional().or(z.literal("")),
  photos: z.array(z.string()).max(5, "الحد الأقصى للصور هو 5").optional(),
});

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
  const result = SubmissionBodyStrict.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "بيانات غير صحيحة", details: result.error.flatten().fieldErrors });
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
      websiteUrl: data.mapsUrl || null,
      mapsUrl: data.mapsUrl || null,
      descriptionAr: data.descriptionAr,
      pricePerNight: String(data.pricePerNight),
      amenities: data.amenities ?? [],
      photos: data.photos ?? [],
    })
    .returning({ id: chaletSubmissionsTable.id });

  sendAdminNewSubmissionEmail({
    nameAr: data.nameAr,
    whatsappNumber: data.whatsappNumber,
    location: data.location,
    pricePerNight: String(data.pricePerNight),
    mapsUrl: data.mapsUrl,
    submissionId: submission.id,
  }).catch(() => {});

  return res.status(201).json({
    id: submission.id,
    message: "تم استلام طلبك، سيتم مراجعته وتفعيله قريباً",
  });
});

export default router;
