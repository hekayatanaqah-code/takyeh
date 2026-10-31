import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";

export const isSupportClosed = (status: unknown) => status === "resolved" || status === "closed";
export class SupportTicketClosedError extends Error {}

/** Replies are ordered by insertion, not client timestamps; original ticket text stays separate. */
export function supportMessagesSql(ticketId: SQL): SQL {
  return sql`COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', m.id, 'author_role', m.author_role, 'body', m.body,
      'attachment_urls', m.attachment_urls, 'created_at', m.created_at
    ) ORDER BY m.id)
    FROM owner_support_messages m WHERE m.ticket_id = ${ticketId}
  ), '[]'::jsonb)`;
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Also protects a legacy reply introduced after migration by an older integration. */
export async function preserveLegacySupportReply(tx: Transaction, id: number) {
  await tx.execute(sql`INSERT INTO owner_support_messages
    (ticket_id, author_role, body, attachment_urls, legacy_reply, created_at)
    SELECT id, 'admin', admin_reply,
      CASE WHEN array_length(admin_attachment_urls, 1) > 0 THEN admin_attachment_urls
        WHEN admin_attachment_url IS NOT NULL THEN ARRAY[admin_attachment_url] ELSE '{}'::text[] END,
      true, admin_reply_at
    FROM owner_support_requests s WHERE id = ${id} AND admin_reply IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM owner_support_messages m WHERE m.ticket_id = s.id)
    ON CONFLICT DO NOTHING`);
}
