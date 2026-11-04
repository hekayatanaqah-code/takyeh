-- Development-only additive schema change. Publish manages the production schema.
BEGIN;
ALTER TABLE service_provider_submissions ADD COLUMN IF NOT EXISTS instagram_account text;
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS instagram_account text;
COMMIT;
