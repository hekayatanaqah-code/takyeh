import { Router } from "express";
import { db } from "@workspace/db";
import { chaletSubmissionsTable } from "@workspace/db/schema";
import { CreateSubmissionBody } from "@workspace/api-zod";

const router = Router();

router.post("/", async (req, res) => {
  const result = CreateSubmissionBody.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: "بيانات غير صحيحة" });
  }

  const data = result.data;

  const [submission] = await db
    .insert(chaletSubmissionsTable)
    .values({
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
