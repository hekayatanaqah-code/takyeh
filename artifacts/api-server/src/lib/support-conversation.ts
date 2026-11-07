import { eq, sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { writeRecords } from "@workspace/db/mutations";
import { supportRequestsQueryTable, supportMessagesQueryTable } from "@workspace/db/runtime-models";
import { sqlSupportMessages } from "@workspace/db/sql-expressions";

export const isSupportClosed = (status: unknown) => status === "resolved" || status === "closed";
export class SupportTicketClosedError extends Error {}

/** Replies are ordered by insertion, not client timestamps; original ticket text stays separate. */
export function supportMessagesSql(ticketId: SQL): SQL {
  return sqlSupportMessages(ticketId);
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Also protects a legacy reply introduced after migration by an older integration. */
export async function preserveLegacySupportReply(tx: Transaction, id: number) {
  const [ticket] = await tx.select().from(supportRequestsQueryTable)
    .where(eq(supportRequestsQueryTable.id, id)).for("update");
  if (!ticket || ticket.adminReply === null) return;
  const existing = await tx.select({ id: supportMessagesQueryTable.id }).from(supportMessagesQueryTable)
    .where(eq(supportMessagesQueryTable.ticketId, id)).limit(1);
  if (existing.length) return;
  const attachments = ticket.adminAttachmentUrls?.length ? ticket.adminAttachmentUrls
    : ticket.adminAttachmentUrl !== null ? [ticket.adminAttachmentUrl] : [];
  await writeRecords(tx, supportMessagesQueryTable, {
    ticketId: id, authorRole: "admin", body: ticket.adminReply,
    attachmentUrls: attachments, legacyReply: true, createdAt: ticket.adminReplyAt,
  }, { conflict: { action: "ignore" } });
}
