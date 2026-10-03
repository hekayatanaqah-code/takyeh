-- Additive only: existing owner-created seasons retain NULL global_season_id.
ALTER TABLE service_seasons
  ADD COLUMN IF NOT EXISTS global_season_id INTEGER REFERENCES global_seasons(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS service_seasons_provider_global_unique
  ON service_seasons(provider_id, global_season_id);