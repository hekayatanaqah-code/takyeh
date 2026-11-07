import { insertRecords, updateRecords } from "@workspace/db/mutations";
import { randomUUID } from "node:crypto";
import {
  db, photographyReceiptUploadsTable as uploads, photographyReceiptCleanupRunsTable as runs,
  photographyReceiptsTable as receipts, photographyTransfersTable as transfers,
  type ReceiptCleanupEntry,
} from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { receiptStorage } from "./photography-receipts";
import { lockPhotographyReceipts, type ReceiptTransaction } from "./photography-receipt-lock";
import { ObjectNotFoundError } from "#object-storage";

type Upload = typeof uploads.$inferSelect;
const scopedPath = /^\/objects\/photography-receipts\/(source|prepared)\/[0-9a-f-]{36}$/;
function retention(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 3650) throw new Error("cleanup_retention");
}

async function inspect(tx: ReceiptTransaction, upload: Upload, days: number, now: Date): Promise<ReceiptCleanupEntry> {
  const paths = [upload.sourcePath, upload.preparedPath];
  const base = { uploadId: upload.id, paths };
  // Never trust a status/booking filter for archive protection. Check EVERY
  // persisted transfer, and also protect aliases of either registered path.
  const saved = await tx.select({ id: transfers.id }).from(transfers)
    .innerJoin(receipts, eq(receipts.id, transfers.receiptId))
    .where(or(eq(receipts.id, upload.receiptId ?? -1),
      eq(receipts.objectPath, upload.sourcePath), eq(receipts.objectPath, upload.preparedPath),
      eq(receipts.sourcePath, upload.sourcePath), eq(receipts.sourcePath, upload.preparedPath))).limit(1);
  if (saved.length) return { ...base, reason: "saved_transfer", candidate: false };
  if (paths.some(path => !scopedPath.test(path))
      || upload.sourcePath !== `/objects/photography-receipts/source/${upload.id}`
      || upload.preparedPath !== `/objects/photography-receipts/prepared/${upload.id}`) {
    return { ...base, reason: "outside_scope", candidate: false };
  }
  if (upload.state === "deleted") return { ...base, reason: "already_deleted", candidate: false };
  if (+upload.expiresAt > +now || +upload.createdAt > +now - days * 86400000) {
    return { ...base, reason: "retained", candidate: false };
  }
  return { ...base, candidate: true, reason: upload.state === "deleting" ? "retry_deletion"
    : upload.state === "invalid" ? "invalid" : upload.state === "ready" ? "unlinked_receipt" : "expired_upload" };
}

// Read-only with respect to storage: no listing, reads, writes or deletes.
// A durable snapshot is the approval boundary; later uploads cannot sneak in.
export async function previewPhotographyReceiptCleanup(retentionDays: number) {
  retention(retentionDays);
  return db.transaction(async tx => {
    await lockPhotographyReceipts(tx);
    const report: ReceiptCleanupEntry[] = [];
    for (const upload of await tx.select().from(uploads)) {
      report.push(await inspect(tx, upload, retentionDays, new Date()));
    }
    const [run] = await insertRecords(tx, runs, { id: randomUUID(), retentionDays, report });
    return run;
  });
}

// Only the explicit maintenance command calls this. Never run approval or
// deletion automatically at startup, on a timer, or in post-merge setup.
export async function approvePhotographyReceiptCleanup(runId: string, retentionDays: number, approvedBy: string) {
  retention(retentionDays);
  if (!approvedBy.trim() || approvedBy.length > 200) throw new Error("cleanup_approver_required");
  return db.transaction(async tx => {
    await lockPhotographyReceipts(tx);
    const [run] = await tx.select().from(runs).where(eq(runs.id, runId)).for("update");
    if (!run || run.retentionDays !== retentionDays) throw new Error("cleanup_report_mismatch");
    if (run.approvedAt) throw new Error("cleanup_already_approved");
    const [approved] = await updateRecords(tx, runs, { approvedBy, approvedAt: new Date() }, eq(runs.id, runId));
    return approved;
  });
}

async function deleteTrackedObject(path: string) {
  try {
    const file = await receiptStorage.getObjectEntityFile(path);
    await file.delete({ ignoreNotFound: true });
  } catch (error) {
    // Authentication, networking and service errors MUST NOT count as missing.
    if (!(error instanceof ObjectNotFoundError)) throw error;
  }
}

export async function executePhotographyReceiptCleanup(runId: string, remove = deleteTrackedObject) {
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run?.approvedAt || !run.approvedBy) throw new Error("cleanup_not_approved");
  for (const reviewed of run.report.filter(entry => entry.candidate)) {
    // Intent commits before touching storage. Both transfer attachment and
    // upload completion then reject this upload even after a process crash.
    const candidate = await db.transaction(async tx => {
      await lockPhotographyReceipts(tx);
      const [upload] = await tx.select().from(uploads).where(eq(uploads.id, reviewed.uploadId)).for("update");
      if (!upload) return null;
      const current = await inspect(tx, upload, run.retentionDays, new Date());
      const [latest] = await tx.select().from(runs).where(eq(runs.id, runId)).for("update");
      const exactPaths = JSON.stringify(current.paths) === JSON.stringify(reviewed.paths);
      await tx.update(runs).set({ events: [...latest.events, {
        at: new Date().toISOString(), uploadId: upload.id,
        result: current.candidate && exactPaths ? "deletion_intent" : `skipped:${current.reason}`,
      }] }).where(eq(runs.id, runId));
      if (!current.candidate || !exactPaths) return null;
      await tx.update(uploads).set({ state: "deleting" }).where(eq(uploads.id, upload.id));
      return current;
    });
    if (!candidate) continue;
    let result = "deleted";
    try {
      for (const path of candidate.paths) await remove(path);
    } catch {
      result = "delete_failed"; // Retry only through the same reviewed snapshot; do not expose provider secrets.
    }
    await db.transaction(async tx => {
      await lockPhotographyReceipts(tx);
      const [latest] = await tx.select().from(runs).where(eq(runs.id, runId)).for("update");
      await tx.update(runs).set({ events: [...latest.events, { at: new Date().toISOString(), uploadId: candidate.uploadId, result }] }).where(eq(runs.id, runId));
      await tx.update(uploads).set(result === "deleted"
        ? { state: "deleted", deletedAt: new Date(), error: null }
        : { error: "delete_failed" }).where(eq(uploads.id, candidate.uploadId));
    });
  }
  const [result] = await db.select().from(runs).where(eq(runs.id, runId));
  return result;
}
