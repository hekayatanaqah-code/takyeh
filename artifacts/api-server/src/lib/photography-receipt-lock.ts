import { db, photographyReceiptsTable, photographyReceiptUploadsTable } from "@workspace/db";
import { lockResource } from "@workspace/db/transaction-lock";
import { eq, sql } from "drizzle-orm";

export type ReceiptTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
// Shared by completion, transfer attachment and cleanup. Never use a
// process-local mutex: more than one server/maintenance process may be running.
export async function lockPhotographyReceipts(tx: ReceiptTransaction) {
  await lockResource(tx, 731226, 1);
}

export async function attachablePhotographyReceipt(tx: ReceiptTransaction, receiptId: number, actor: string) {
  await lockPhotographyReceipts(tx);
  const [receipt] = await tx.select().from(photographyReceiptsTable).where(eq(photographyReceiptsTable.id, receiptId));
  if (!receipt || receipt.uploadedBy !== actor) return null;
  const [upload] = await tx.select().from(photographyReceiptUploadsTable).where(eq(photographyReceiptUploadsTable.receiptId, receiptId));
  // Missing registry means a legacy SAVED receipt, which must remain usable.
  return upload && upload.state !== "ready" ? null : receipt;
}
