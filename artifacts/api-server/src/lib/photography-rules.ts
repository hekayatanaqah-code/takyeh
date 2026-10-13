import { z } from "zod";
import { ibanSchema, bankSchema } from "./photography-finance";
export const availabilitySchema = z.array(z.object({
  weekday: z.number().int().min(0).max(6),
  start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
})).max(28).superRefine((rows, ctx) => {
  rows.forEach((row, i) => {
    if (row.end <= row.start) ctx.addIssue({ code: "custom", message: "وقت النهاية يجب أن يلي البداية", path: [i] });
    if (rows.some((other, j) => j < i && other.weekday === row.weekday && row.start < other.end && row.end > other.start)) {
      ctx.addIssue({ code: "custom", message: "أوقات التفرغ متداخلة", path: [i] });
    }
  });
});
export const blockedDatesSchema = z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
}, "تاريخ الإغلاق غير صحيح")).max(3660).transform(dates => [...new Set(dates)].sort());
export const coverageSchema = z.object({
  regionId: z.number().int().positive(), cityId: z.number().int().positive(),
  districtIds: z.array(z.number().int().positive()).max(200),
  allDistricts: z.boolean(),
}).refine(v => v.allDistricts || v.districtIds.length > 0, "حدد الأحياء أو اختر كل الأحياء");
export const photographerProfileSchema = z.object({
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).transform(v => v.toLowerCase()).optional(),
  bio: z.string().trim().max(2000),
  experienceYears: z.enum(["", "under_1", "1_3", "3_5", "over_5"]).optional(),
  portfolioUrl: z.string().trim().max(2000).refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
    } catch { return false; }
  }, "أدخل رابط معرض أعمال صحيحاً يبدأ بـ https:// أو http://").optional(),
  profileImagePath: z.string().regex(/^(?:|\/objects\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp)$/).optional(),
  regionId: z.number().int().positive(), cityId: z.number().int().positive(),
  districtIds: z.array(z.number().int().positive()).max(200), allDistricts: z.boolean(),
  sessionMinutes: z.number().int().min(30).max(240),
  availability: availabilitySchema,
  blockedDates: blockedDatesSchema.optional(),
  iban: ibanSchema.optional(),
  bankName: bankSchema.optional(),
}).refine(v => v.allDistricts || v.districtIds.length > 0, "حدد الأحياء أو اختر كل الأحياء");
export function photoPhone(value: string): string | null {
  const digits = value.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s()+-]/g, "");
  const phone = digits.replace(/^00966/, "966").replace(/^0(?=5)/, "966").replace(/^5/, "9665");
  return /^9665\d{8}$/.test(phone) ? phone : null;
}
export function photographyQuote(priceHalalas: number, platformPercent: number) {
  const commissionHalalas = Math.round(priceHalalas * platformPercent / 100);
  return { priceHalalas, commissionHalalas, photographerEarningsHalalas: priceHalalas - commissionHalalas };
}
export function photographySlots(
  date: string, sessionMinutes: number,
  availability: { weekday: number; start: string; end: string }[],
  blocked: { startAt: Date; endAt: Date }[], now = new Date(), blockedDates: string[] = [],
) {
  if (blockedDates.includes(date)) return [];
  const midnight = new Date(`${date}T00:00:00+03:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(+midnight)
    || new Date(+midnight + 3 * 3600000).toISOString().slice(0, 10) !== date) return [];
  const weekday = new Date(+midnight + 3 * 3600000).getUTCDay();
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const slots: { startAt: string; endAt: string }[] = [];
  for (const row of availability.filter(a => a.weekday === weekday)) {
    for (let m = minutes(row.start); m + sessionMinutes <= minutes(row.end); m += sessionMinutes) {
      const startAt = new Date(+midnight + m * 60000);
      const endAt = new Date(+startAt + sessionMinutes * 60000);
      if (+startAt <= +now || +startAt > +now + 90 * 86400000) continue;
      if (blocked.some(b => +b.startAt < +endAt && +b.endAt > +startAt)) continue;
      slots.push({ startAt: startAt.toISOString(), endAt: endAt.toISOString() });
    }
  }
  return slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
}
