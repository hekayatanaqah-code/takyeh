-- Additive only. Default feature state remains disabled; no existing data is changed.
CREATE TABLE IF NOT EXISTS photographers (
 id serial PRIMARY KEY, name text NOT NULL, whatsapp text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'invited' CHECK(status IN ('invited','pending','approved','rejected','suspended')),
 bio text NOT NULL DEFAULT '', region_id integer, city_id integer,
 district_ids jsonb NOT NULL DEFAULT '[]', all_districts boolean NOT NULL DEFAULT false,
 session_minutes integer NOT NULL DEFAULT 60 CHECK(session_minutes BETWEEN 30 AND 240),
 availability jsonb NOT NULL DEFAULT '[]', admin_note text, password_hash text,
 invite_hash text UNIQUE, invite_expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS photography_packages (
 id serial PRIMARY KEY, name text NOT NULL, price_halalas integer NOT NULL CHECK(price_halalas >= 100),
 platform_percent numeric(5,2) NOT NULL CHECK(platform_percent BETWEEN 0 AND 100), active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS photographer_sessions (
 hash text PRIMARY KEY, photographer_id integer NOT NULL REFERENCES photographers(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS photography_bookings (
 id serial PRIMARY KEY, owner_id text NOT NULL, property_id integer NOT NULL,
 photographer_id integer NOT NULL REFERENCES photographers(id), package_id integer NOT NULL REFERENCES photography_packages(id),
 property_name text NOT NULL, photographer_name text NOT NULL, package_name text NOT NULL,
 owner_phone text NOT NULL, photographer_phone text NOT NULL, start_at timestamptz NOT NULL, end_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'awaiting_payment'
 CHECK(status IN ('awaiting_payment','confirmed','expired','cancelled','completed','payment_review')),
 price_halalas integer NOT NULL, commission_halalas integer NOT NULL, photographer_earnings_halalas integer NOT NULL,
 invoice_id text UNIQUE, payment_id text UNIQUE, payment_url text, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_at > start_at), CHECK(price_halalas = commission_halalas + photographer_earnings_halalas)
);
CREATE INDEX IF NOT EXISTS photography_slot_lookup ON photography_bookings(photographer_id,start_at,end_at);
CREATE TABLE IF NOT EXISTS photography_deliveries (
 id serial PRIMARY KEY, dedupe_key text NOT NULL UNIQUE, booking_id integer REFERENCES photography_bookings(id) ON DELETE CASCADE,
 photographer_id integer REFERENCES photographers(id) ON DELETE CASCADE, recipient text NOT NULL, kind text NOT NULL,
 parameters jsonb NOT NULL, status text NOT NULL DEFAULT 'pending', error text, provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO site_settings(key,value) VALUES ('photography_enabled','false') ON CONFLICT(key) DO NOTHING;

-- Reviewed additive development schema update for photographer profile details.
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS experience_years text NOT NULL DEFAULT '';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS portfolio_url text NOT NULL DEFAULT '';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS profile_image_path text NOT NULL DEFAULT '';
