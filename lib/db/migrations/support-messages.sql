BEGIN;
CREATE TABLE IF NOT EXISTS owner_support_messages (
  id serial PRIMARY KEY,
  ticket_id integer NOT NULL REFERENCES owner_support_requests(id) ON DELETE CASCADE,
  author_role text NOT NULL CHECK (author_role IN ('owner', 'admin')),
  author_id text,
  author_name text,
  body text NOT NULL,
  attachment_urls text[] NOT NULL DEFAULT '{}',
  legacy_reply boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS owner_support_messages_ticket_order_idx ON owner_support_messages(ticket_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS owner_support_messages_legacy_reply_idx ON owner_support_messages(ticket_id) WHERE legacy_reply = true;
-- Preserve the existing reply, its attachments and actual timestamp without inventing history.
INSERT INTO owner_support_messages(ticket_id, author_role, body, attachment_urls, legacy_reply, created_at)
SELECT id, 'admin', admin_reply,
  CASE WHEN array_length(admin_attachment_urls, 1) > 0 THEN admin_attachment_urls
       WHEN admin_attachment_url IS NOT NULL THEN ARRAY[admin_attachment_url] ELSE '{}'::text[] END,
  true, admin_reply_at
FROM owner_support_requests s
WHERE admin_reply IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM owner_support_messages m WHERE m.ticket_id = s.id)
ON CONFLICT DO NOTHING;
COMMIT;
