-- Additive development schema only; no automatic production migration or money movement.
BEGIN;
CREATE TABLE IF NOT EXISTS photography_receipts (
 id serial PRIMARY KEY, object_path text NOT NULL UNIQUE, source_path text UNIQUE, name text NOT NULL,
 content_type text NOT NULL, size integer NOT NULL, uploaded_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE photography_transfers ADD COLUMN IF NOT EXISTS receipt_id integer REFERENCES photography_receipts(id),
 ADD COLUMN IF NOT EXISTS recorded_by text;
CREATE UNIQUE INDEX IF NOT EXISTS photography_transfer_receipt_unique ON photography_transfers(receipt_id);
ALTER TABLE photography_bookings ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card',
 ADD COLUMN IF NOT EXISTS refunded_halalas integer NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS financial_status text NOT NULL DEFAULT 'unpaid';
UPDATE photography_bookings SET financial_status='paid' WHERE status IN ('confirmed','completed') AND financial_status='unpaid';
ALTER TABLE photography_bookings ALTER COLUMN financial_status SET DEFAULT 'unpaid';
UPDATE photography_bookings SET financial_status='unpaid' WHERE status='awaiting_payment' AND payment_id IS NULL;
ALTER TABLE subscription_checkout_intents ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'card';
CREATE TABLE IF NOT EXISTS photography_refunds (
 id serial PRIMARY KEY, request_key text NOT NULL UNIQUE,
 booking_id integer NOT NULL REFERENCES photography_bookings(id) ON DELETE CASCADE,
 owner_id text NOT NULL, amount_halalas integer NOT NULL CONSTRAINT photography_refund_positive CHECK(amount_halalas>0),
 destination text NOT NULL, reason text NOT NULL, status text NOT NULL DEFAULT 'pending',
 provider_refund_id text, attempted_at timestamptz, error text, requested_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS owner_wallet_entries (
 id serial PRIMARY KEY, owner_id text NOT NULL, source_key text NOT NULL UNIQUE,
 kind text NOT NULL, amount_halalas integer NOT NULL CONSTRAINT owner_wallet_nonzero CHECK(amount_halalas<>0),
 description text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS owner_wallet_owner_idx ON owner_wallet_entries(owner_id);
COMMIT;
