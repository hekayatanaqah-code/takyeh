CREATE TABLE IF NOT EXISTS broadcast_smtp_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  host TEXT,
  port INTEGER CHECK (port BETWEEN 1 AND 65535),
  secure BOOLEAN NOT NULL DEFAULT false,
  username TEXT,
  from_address TEXT,
  encrypted_password TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);