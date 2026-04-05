import { Router } from "express";
import { db } from "@workspace/db";
import { chaletSubmissionsTable } from "@workspace/db/schema";
import { CreateSubmissionBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { sendAdminNewSubmissionEmail } from "../lib/email";

const SubmissionBodyStrict = CreateSubmissionBody.extend({
  nameAr: z.string().trim().min(2, "اسم الشاليه مطلوب (حرفان على الأقل)"),
  location: z.string().trim().min(2, "المدينة مطلوبة"),
  district: z.string().trim().optional(),
  descriptionAr: z.string().trim().min(3, "الوصف قصير جداً (٣ أحرف على الأقل)"),
  whatsappNumber: z.string().trim().min(9, "رقم واتساب غير صحيح"),
  pricePerNight: z.number().min(0),
  priceMorning: z.number().nullable().optional(),
  priceEvening: z.number().nullable().optional(),
  priceFullDay: z.number().nullable().optional(),
  slotMorning: z.boolean().optional(),
  slotEvening: z.boolean().optional(),
  slotFullDay: z.boolean().optional(),
  priceWeekday: z.number().min(0).nullable().optional(),
  priceWeekend: z.number().min(0).nullable().optional(),
  seasonalDisclaimer: z.boolean().optional(),
  mapsUrl: z.string().optional().nullable().or(z.literal("")),
  socialLink: z.string().optional().nullable(),
  photos: z.array(z.string()).max(15, "الحد الأقصى للصور هو 15").optional(),
  videoUrl: z.string().optional(),
  termsAndConditions: z.string().optional().nullable(),
  maxGuests: z.number().int().min(1).nullable().optional(),
  bedrooms: z.number().int().min(0).nullable().optional(),
  propertyType: z.string().trim().optional().nullable(),
  sections: z.string().trim().optional().nullable(),
  checkInTime: z.string().optional().nullable(),
  checkOutTime: z.string().optional().nullable(),
  morningCheckIn: z.string().optional().nullable(),
  morningCheckOut: z.string().optional().nullable(),
  eveningCheckIn: z.string().optional().nullable(),
  eveningCheckOut: z.string().optional().nullable(),
  fullDayCheckIn: z.string().optional().nullable(),
  fullDayCheckOut: z.string().optional().nullable(),
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
      district: data.district || null,
      websiteUrl: data.mapsUrl || null,
      mapsUrl: data.mapsUrl || null,
      descriptionAr: data.descriptionAr,
      pricePerNight: String(data.pricePerNight),
      priceMorning: data.priceMorning != null ? String(data.priceMorning) : null,
      priceEvening: data.priceEvening != null ? String(data.priceEvening) : null,
      priceFullDay: data.priceFullDay != null ? String(data.priceFullDay) : null,
      slotMorning: data.slotMorning ?? true,
      slotEvening: data.slotEvening ?? true,
      slotFullDay: data.slotFullDay ?? true,
      priceWeekday: data.priceWeekday != null ? String(data.priceWeekday) : null,
      priceWeekend: data.priceWeekend != null ? String(data.priceWeekend) : null,
      seasonalDisclaimer: data.seasonalDisclaimer ?? true,
      amenities: data.amenities ?? [],
      photos: data.photos ?? [],
      videoUrl: data.videoUrl || null,
      socialLink: data.socialLink || null,
      termsAndConditions: data.termsAndConditions || null,
      maxGuests: data.maxGuests ?? null,
      bedrooms: data.bedrooms ?? null,
      propertyType: data.propertyType || null,
      sections: data.sections || null,
      checkInTime: data.checkInTime || null,
      checkOutTime: data.checkOutTime || null,
      morningCheckIn: data.morningCheckIn || null,
      morningCheckOut: data.morningCheckOut || null,
      eveningCheckIn: data.eveningCheckIn || null,
      eveningCheckOut: data.eveningCheckOut || null,
      fullDayCheckIn: data.fullDayCheckIn || null,
      fullDayCheckOut: data.fullDayCheckOut || null,
      trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
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
