CREATE TABLE IF NOT EXISTS quick_sales_settings (
  owner_id text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS quick_sales (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  provider_id integer NOT NULL REFERENCES service_providers(id) ON DELETE RESTRICT,
  provider_name text NOT NULL,
  date_str date NOT NULL,
  client_name text NOT NULL DEFAULT '',
  items jsonb NOT NULL,
  total numeric(14,2) NOT NULL CHECK(total > 0),
  payment_method text NOT NULL CHECK(payment_method IN ('cash', 'bank')),
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'completed' CHECK(status IN ('completed', 'cancelled')),
  idempotency_key text NOT NULL,
  request_hash text NOT NULL,
  cancellation_reason text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS quick_sales_owner_request_idx ON quick_sales(owner_id, idempotency_key);
CREATE INDEX IF NOT EXISTS quick_sales_owner_date_idx ON quick_sales(owner_id, date_str);
CREATE INDEX IF NOT EXISTS quick_sales_provider_idx ON quick_sales(provider_id);
