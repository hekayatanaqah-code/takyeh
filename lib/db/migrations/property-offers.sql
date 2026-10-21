CREATE TABLE IF NOT EXISTS property_offers (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  submission_id integer NOT NULL REFERENCES chalet_submissions(id),
  name_ar text NOT NULL CHECK (length(trim(name_ar)) BETWEEN 1 AND 120),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  weekdays jsonb NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed','night_price')),
  value numeric(12,2) NOT NULL CHECK (value > 0 AND (discount_type <> 'percent' OR value <= 100)),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_offers_submission_idx ON property_offers(submission_id,enabled);
ALTER TABLE owner_bookings ADD COLUMN IF NOT EXISTS offer_snapshot jsonb;
