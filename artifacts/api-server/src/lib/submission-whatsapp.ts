import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { normalizeTaqnyatPhone, sendTaqnyatTemplate } from "../../../../taqnyatWhatsApp.js";

export type SubmissionNotice = {
  kind: "property" | "service";
  id: number;
  ownerId: string | null;
  activityName: string;
  phone: string;
  previousStatus: string;
  status: string;
  previousNote?: string | null;
  adminNote?: string | null;
};

async function findOwner(ownerId: string | null): Promise<{ name: string; phone: string } | undefined> {
  if (!ownerId) return;
  const reserved = /^owner_([1-9]\d*)$/.exec(ownerId);
  // Reserved local aliases never resolve via a different account's external link.
  const result = await db.execute<{ name: string; phone: string }>(sql`
    SELECT full_name AS name, phone FROM owner_applications
    WHERE deleted_at IS NULL AND ${reserved
      ? sql`id = ${Number(reserved[1])}`
      : sql`id = (SELECT owner_application_id FROM owner_account_links WHERE user_id = ${ownerId} LIMIT 1)`}
    LIMIT 1`);
  return result.rows[0];
}

/** Call only after the decision/publishing transaction commits. Never throws to its caller. */
export async function notifySubmissionDecision(
  notice: SubmissionNotice,
  warn: (details: { kind: string; submissionId: number; reason: string }, message: string) => void,
  dependencies = { findOwner, send: sendTaqnyatTemplate },
) {
  if (!["approved", "needs_revision"].includes(notice.status)) return "skipped";
  if (notice.previousStatus === notice.status &&
      (notice.status !== "needs_revision" || (notice.previousNote ?? "").trim() === (notice.adminNote ?? "").trim())) return "skipped";
  try {
    const owner = await dependencies.findOwner(notice.ownerId);
    const phone = normalizeTaqnyatPhone(owner?.phone || notice.phone);
    if (!phone) throw new Error("invalid_phone");
    const approved = notice.status === "approved";
    const template = approved
      ? process.env.TAQNYAT_SUBMISSION_APPROVED_TEMPLATE
      : process.env.TAQNYAT_SUBMISSION_REVISION_TEMPLATE;
    if (!template) throw new Error("template_not_configured");
    const parameters = [owner?.name?.trim() || "شريكنا العزيز", notice.activityName];
    if (!approved) parameters.push(notice.adminNote?.trim() || "يرجى مراجعة البيانات واستكمالها من لوحة التحكم.");
    const result = await dependencies.send(phone, template, parameters, process.env.TAQNYAT_SUBMISSION_TEMPLATE_LANGUAGE || "ar");
    if (!result.success) throw new Error(result.error || "provider_failed");
    return "accepted";
  } catch (error) {
    // Do not log recipient numbers, provider bodies, tokens or private administrator notes.
    const reason = error instanceof Error && ["invalid_phone", "template_not_configured", "not_configured", "provider_failed", "provider_rejected", "provider_unavailable"].includes(error.message)
      ? error.message : "notification_failed";
    warn({ kind: notice.kind, submissionId: notice.id, reason }, "Submission WhatsApp notification was not accepted; decision remains saved");
    return "failed";
  }
}
