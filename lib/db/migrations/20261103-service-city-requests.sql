-- Reviewed additive development migration. Production schema is applied by Publish.
BEGIN;
CREATE TABLE IF NOT EXISTS service_city_requests (
  id serial PRIMARY KEY,
  city text NOT NULL,
  region_id integer REFERENCES service_regions_catalog(id) ON DELETE SET NULL,
  requester_id text NOT NULL,
  requester_name text NOT NULL DEFAULT 'مقدم خدمة',
  status text NOT NULL DEFAULT 'pending',
  reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  approved_city_id integer REFERENCES service_cities_catalog(id) ON DELETE SET NULL,
  legacy_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_city_requests_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);
CREATE INDEX IF NOT EXISTS service_city_requests_status_idx ON service_city_requests(status, created_at);
INSERT INTO service_city_requests (city, requester_id, legacy_key, created_at)
SELECT regexp_replace(value, ' \(طلب من:.*\)$', ''),
       COALESCE(substring(value FROM ' \(طلب من: (.*)\)$'), 'legacy'),
       key,
       to_timestamp(substring(key FROM '[0-9]+$')::numeric / 1000)
FROM site_settings
WHERE key ~ '^city_request_[0-9]{13}$'
ON CONFLICT (legacy_key) DO NOTHING;
DELETE FROM site_settings s
USING service_city_requests r
WHERE s.key = r.legacy_key;
COMMIT;
