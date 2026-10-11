-- Delivery attempts remain separate from whether the in-app notice was read.
ALTER TABLE photography_deliveries ADD COLUMN IF NOT EXISTS internal_read_at timestamptz;
