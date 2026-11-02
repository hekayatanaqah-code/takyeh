-- Additive only. Legacy receipts deliberately remain outside cleanup scope.
CREATE TABLE IF NOT EXISTS photography_receipt_uploads (
  id text PRIMARY KEY,
  source_path text NOT NULL UNIQUE,
  prepared_path text NOT NULL UNIQUE,
  uploaded_by text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'requested' CHECK (state IN ('requested','ready','invalid','deleting','deleted')),
  receipt_id integer UNIQUE,
  error text,
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS photography_receipt_cleanup_runs (
  id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 1 AND 3650),
  report jsonb NOT NULL,
  approved_by text,
  approved_at timestamptz,
  events jsonb NOT NULL DEFAULT '[]'::jsonb
);
