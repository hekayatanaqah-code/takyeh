import { db, siteSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

export const submissionTemplateKeys = [
  "taqnyat_submission_approved_template",
  "taqnyat_submission_revision_template",
] as const;

export function effectiveSubmissionTemplates(stored: Record<string, string>) {
  return {
    taqnyat_submission_approved_template: stored.taqnyat_submission_approved_template
      ?? process.env.TAQNYAT_SUBMISSION_APPROVED_TEMPLATE ?? "",
    taqnyat_submission_revision_template: stored.taqnyat_submission_revision_template
      ?? process.env.TAQNYAT_SUBMISSION_REVISION_TEMPLATE ?? "",
  };
}

export function validSubmissionTemplateName(value: string) {
  // Empty explicitly disables this notice. Do not fall back to the old environment value.
  return value === "" || /^[a-z0-9_]{1,512}$/.test(value);
}

export async function loadSubmissionTemplates() {
  const rows = await db.select({ key: siteSettingsTable.key, value: siteSettingsTable.value })
    .from(siteSettingsTable).where(inArray(siteSettingsTable.key, [...submissionTemplateKeys]));
  return effectiveSubmissionTemplates(Object.fromEntries(rows.map(row => [row.key, row.value])));
}
