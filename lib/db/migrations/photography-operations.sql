-- Reviewed additive development migration. Never runs automatically against production.
BEGIN;
ALTER TABLE photographers
  ADD COLUMN IF NOT EXISTS rotation_credit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_assignments integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS rating_sum integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rating_count integer NOT NULL DEFAULT 0;
ALTER TABLE photography_bookings
  ADD COLUMN IF NOT EXISTS assignment_status text NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS target_city text,
  ADD COLUMN IF NOT EXISTS target_region text,
  ADD COLUMN IF NOT EXISTS target_district text;
CREATE TABLE IF NOT EXISTS photography_reviews (
  id serial PRIMARY KEY,
  booking_id integer NOT NULL REFERENCES photography_bookings(id) ON DELETE CASCADE,
  photographer_id integer NOT NULL REFERENCES photographers(id),
  owner_id text NOT NULL,
  stars integer NOT NULL CONSTRAINT photography_rating_range CHECK (stars BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS photography_review_booking_unique ON photography_reviews(booking_id);
CREATE TABLE IF NOT EXISTS photography_cancellations (
  id serial PRIMARY KEY,
  booking_id integer NOT NULL REFERENCES photography_bookings(id) ON DELETE CASCADE,
  photographer_id integer NOT NULL REFERENCES photographers(id),
  reason text NOT NULL CONSTRAINT photography_decline_reason CHECK (reason IN ('emergency','equipment','personal','other')),
  details text NOT NULL DEFAULT '',
  replacement_photographer_id integer REFERENCES photographers(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS photography_decline_booking_photographer_unique
  ON photography_cancellations(booking_id, photographer_id);
CREATE INDEX IF NOT EXISTS photography_decline_recent_idx ON photography_cancellations(photographer_id, created_at);
CREATE TABLE IF NOT EXISTS photography_alerts (
  id serial PRIMARY KEY,
  dedupe_key text NOT NULL UNIQUE,
  kind text NOT NULL,
  photographer_id integer NOT NULL REFERENCES photographers(id),
  booking_id integer REFERENCES photography_bookings(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  resolved_at timestamptz
);
-- Existing photographers with paid history must not be treated as brand-new.
UPDATE photographers p SET confirmed_assignments = GREATEST(p.confirmed_assignments,
  (SELECT count(*)::integer FROM photography_bookings b
   WHERE b.photographer_id = p.id AND b.status IN ('confirmed','completed')));
COMMIT;
