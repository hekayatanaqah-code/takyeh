import { randomUUID } from "node:crypto";
import { z } from "zod";

export function isArabicServiceCategoryName(value: string): boolean {
  const letters = value.match(/\p{L}/gu) ?? [];
  return letters.length > 0 && letters.every(letter => /\p{Script=Arabic}/u.test(letter));
}

export const arabicServiceCategoryName = z.string().trim().min(1, "اسم الفئة مطلوب")
  .refine(isArabicServiceCategoryName, "اكتب اسم الفئة بالعربية فقط");

export const serviceCategoryCreationSchema = z.object({
  // Compatibility for existing clients; new interfaces never request a key.
  key: z.string().trim().min(1).optional(),
  labelAr: arabicServiceCategoryName,
  emoji: z.string().default("✨"),
  sortOrder: z.number().int().default(0),
}).transform(value => ({ ...value, key: value.key ?? `service_${randomUUID().replace(/-/g, "")}` }));
