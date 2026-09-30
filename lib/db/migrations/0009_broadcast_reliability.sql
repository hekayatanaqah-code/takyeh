ALTER TABLE broadcast_deliveries
  ADD COLUMN IF NOT EXISTS recipient_owner_id TEXT,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT,
  ADD COLUMN IF NOT EXISTS recipient_whatsapp_phone TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name TEXT,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
UPDATE broadcast_deliveries d
SET recipient_owner_id = COALESCE(link.user_id, CONCAT('owner_', oa.id::text)),
    recipient_email = oa.email,
    recipient_name = oa.full_name,
    recipient_whatsapp_phone = CASE
      WHEN oa.whatsapp_news_subscribe = true AND oa.whatsapp_subscribed_at IS NOT NULL
        AND settings.wa_enabled = true
        AND settings.wa_phone ~ '^\+[1-9][0-9]{7,14}$'
      THEN settings.wa_phone ELSE NULL END
FROM owner_applications oa
LEFT JOIN owner_account_links link ON link.owner_application_id = oa.id
LEFT JOIN owner_notification_settings settings
  ON settings.owner_id = COALESCE(link.user_id, CONCAT('owner_', oa.id::text))
  OR settings.owner_id = CONCAT('owner_', oa.id::text)
WHERE d.recipient_key = CONCAT('app:', oa.id::text)
  AND d.recipient_owner_id IS NULL;
UPDATE broadcast_deliveries d
SET recipient_owner_id = u.id,
    recipient_email = u.email,
    recipient_name = NULLIF(CONCAT_WS(' ', u.first_name, u.last_name), '')
FROM users u
WHERE d.recipient_key = CONCAT('user:', u.id)
  AND d.recipient_owner_id IS NULL;
UPDATE broadcast_deliveries SET recipient_owner_id = recipient_key WHERE recipient_owner_id IS NULL;
ALTER TABLE broadcast_deliveries ALTER COLUMN recipient_owner_id SET NOT NULL;

ALTER TABLE broadcast_deliveries
  DROP CONSTRAINT IF EXISTS broadcast_deliveries_status_check;
ALTER TABLE broadcast_deliveries
  ADD CONSTRAINT broadcast_deliveries_status_check
  CHECK (status IN ('pending', 'sending', 'delivered', 'failed'));
CREATE INDEX IF NOT EXISTS broadcast_deliveries_status_id_idx
  ON broadcast_deliveries(status, id);

ALTER TABLE owner_notifications
  ADD COLUMN IF NOT EXISTS broadcast_campaign_id INTEGER,
  ADD COLUMN IF NOT EXISTS broadcast_recipient_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS owner_notifications_broadcast_recipient_uq
  ON owner_notifications(broadcast_campaign_id, broadcast_recipient_key);

CREATE TABLE IF NOT EXISTS owner_broadcast_inbox (
  id SERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_name TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  recipient_key TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT owner_broadcast_inbox_campaign_recipient_uq UNIQUE (campaign_id, recipient_key)
);
CREATE INDEX IF NOT EXISTS owner_broadcast_inbox_owner_created_idx
  ON owner_broadcast_inbox(owner_id, created_at);