-- Additive schema for superadmin-granted free full access.
CREATE TABLE IF NOT EXISTS owner_free_access_grants (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  actor_id text NOT NULL,
  reason text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS owner_free_access_grants_owner_created_idx
  ON owner_free_access_grants (owner_id, created_at, id);