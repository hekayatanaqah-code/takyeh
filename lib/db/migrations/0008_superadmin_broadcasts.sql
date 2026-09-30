CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('all', 'active', 'providers')),
  channels TEXT[] NOT NULL,
  idempotency_key TEXT UNIQUE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS broadcast_deliveries (
  id SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES broadcast_campaigns(id) ON DELETE CASCADE,
  recipient_key TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('inApp', 'inbox', 'email', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  error_code TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT broadcast_deliveries_campaign_recipient_channel_uq
    UNIQUE (campaign_id, recipient_key, channel)
);
CREATE INDEX IF NOT EXISTS broadcast_deliveries_campaign_status_idx
  ON broadcast_deliveries(campaign_id, status);

CREATE TABLE IF NOT EXISTS owner_broadcast_preferences (
  owner_key TEXT PRIMARY KEY,
  in_app BOOLEAN NOT NULL DEFAULT true,
  inbox BOOLEAN NOT NULL DEFAULT false,
  email BOOLEAN NOT NULL DEFAULT false,
  whatsapp BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE owner_support_requests
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'owner_request';