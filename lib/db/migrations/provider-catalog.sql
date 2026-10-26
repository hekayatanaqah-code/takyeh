-- Reviewed additive migration. Does not modify existing tables or records.
CREATE TABLE IF NOT EXISTS provider_catalog_items (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('service', 'product')),
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(12,2) NOT NULL CHECK (price > 0 AND price <= 1000000),
  pricing_unit TEXT NOT NULL CHECK (pricing_unit IN ('per_request', 'per_hour', 'per_day', 'per_piece')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS provider_catalog_items_provider_idx ON provider_catalog_items(provider_id);
CREATE TABLE IF NOT EXISTS provider_offers (
  id SERIAL PRIMARY KEY,
  provider_id INTEGER NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  item_id INTEGER REFERENCES provider_catalog_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  value NUMERIC(12,2) NOT NULL CHECK (value > 0 AND value <= 1000000 AND (discount_type <> 'percentage' OR value <= 100)),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS provider_offers_provider_idx ON provider_offers(provider_id);
