import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const REMINDER_PREVIEW_PREFIX = "subscription_reminder_preview:";

const previewSchema = z.object({
  ownerId: z.string().min(1),
  milestone: z.union([z.literal(3), z.literal(0)]),
  expiresAt: z.string().datetime({ offset: true }),
  previewUntil: z.string().datetime({ offset: true }),
});

export type ReminderPreview = z.infer<typeof previewSchema>;

export function parseReminderPreview(value: string): ReminderPreview | null {
  try {
    const parsed = previewSchema.safeParse(JSON.parse(value));
    if (!parsed.success || Date.parse(parsed.data.previewUntil) <= Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function getReminderPreview(ownerId: string): Promise<ReminderPreview | null> {
  const [setting] = await db.select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, `${REMINDER_PREVIEW_PREFIX}${ownerId}`))
    .limit(1);
  const preview = setting?.value ? parseReminderPreview(setting.value) : null;
  return preview?.ownerId === ownerId ? preview : null;
}