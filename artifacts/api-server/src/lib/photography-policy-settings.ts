import { db, siteSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { photographyPolicy } from "./photography-allocation-policy";

export const photographyPolicySchema = z.object({
  introBookings: z.number().int().min(0).max(100),
  cancellationThreshold: z.number().int().min(1).max(100),
  cancellationWindowDays: z.number().int().min(1).max(365),
  qualityThreshold: z.number().min(1).max(5).multipleOf(0.1),
}).strict();
export async function getPhotographyPolicy(store: Pick<typeof db, "select"> = db) {
  const [row] = await store.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "photography_policy"));
  if (!row) return { ...photographyPolicy };
  return photographyPolicySchema.parse(JSON.parse(row.value));
}
