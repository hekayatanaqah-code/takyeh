-- Additive only: anonymous historical sales cannot safely be matched by name.
ALTER TABLE quick_sales ADD COLUMN IF NOT EXISTS client_phone text NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS quick_sales_owner_phone_idx ON quick_sales(owner_id, client_phone);
