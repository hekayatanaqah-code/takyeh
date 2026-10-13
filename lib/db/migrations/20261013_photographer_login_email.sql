-- Additive only: contacts may be reused across independently authenticated roles.
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
