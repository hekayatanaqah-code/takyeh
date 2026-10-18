-- Additive only: no changes to employee, payroll or expense data.
CREATE TABLE IF NOT EXISTS staff_holdings (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  staff_id integer NOT NULL REFERENCES owner_staff(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('custody', 'withheld', 'emergency', 'deposit')),
  description text NOT NULL,
  amount numeric(10,2) NOT NULL CHECK (amount >= 0 AND (kind = 'custody' OR amount > 0)),
  recorded_on date NOT NULL,
  notes text NOT NULL DEFAULT '',
  request_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  settled_on date,
  settlement_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (status = 'open' AND settled_on IS NULL AND settlement_notes IS NULL) OR
    (status = 'settled' AND settled_on >= recorded_on AND length(trim(settlement_notes)) > 0)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_holdings_owner_request ON staff_holdings(owner_id, request_id);
CREATE INDEX IF NOT EXISTS staff_holdings_owner_staff ON staff_holdings(owner_id, staff_id);
