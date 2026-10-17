import { z } from "zod";

export const customMessageTemplateSchema = z.object({ id: z.string(), title: z.string(), body: z.string() });
const storedTemplatesSchema = z.object({
  customTemplates: z.array(customMessageTemplateSchema),
  detailedReceiptTemplate: z.string().nullable().optional(),
});

/** Keep reading the legacy array while adding named templates without a schema migration. */
export function readOwnerMessageTemplates(raw: string | null | undefined) {
  let value: unknown;
  try { value = JSON.parse(raw || "[]"); } catch { value = []; }
  const legacy = z.array(customMessageTemplateSchema).safeParse(value);
  if (legacy.success) return { customTemplates: legacy.data, detailedReceiptTemplate: null };
  const current = storedTemplatesSchema.safeParse(value);
  return current.success
    ? { customTemplates: current.data.customTemplates, detailedReceiptTemplate: current.data.detailedReceiptTemplate ?? null }
    : { customTemplates: [], detailedReceiptTemplate: null };
}
