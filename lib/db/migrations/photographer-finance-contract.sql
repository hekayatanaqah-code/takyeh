-- Additive only: preserve existing photographers, sessions and bookings.
CREATE TABLE IF NOT EXISTS photography_contracts (
  id serial PRIMARY KEY,
  html text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS iban text NOT NULL DEFAULT '';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS bank_name text NOT NULL DEFAULT '';
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS contract_version integer REFERENCES photography_contracts(id);
ALTER TABLE photographers ADD COLUMN IF NOT EXISTS contract_accepted_at timestamptz;
CREATE TABLE IF NOT EXISTS photography_transfers (
  id serial PRIMARY KEY,
  photographer_id integer NOT NULL REFERENCES photographers(id),
  amount_halalas integer NOT NULL CONSTRAINT photography_transfer_positive CHECK (amount_halalas > 0),
  reference text NOT NULL UNIQUE,
  transferred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
