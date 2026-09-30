-- Additive account discount and calendar-window support. Existing paid records
-- and checkout/renewal quotes remain unchanged.
ALTER TABLE owner_free_access_grants
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

CREATE TABLE IF NOT EXISTS owner_account_discounts (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  actor_id text NOT NULL,
  kind text NOT NULL,
  value numeric(15, 2) NOT NULL,
  start_date date,
  end_date date,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE owner_account_discounts
  ALTER COLUMN value TYPE numeric(15, 2);
CREATE INDEX IF NOT EXISTS owner_account_discounts_owner_created_idx
  ON owner_account_discounts (owner_id, created_at, id);

ALTER TABLE subscription_checkout_intents
  ADD COLUMN IF NOT EXISTS account_discount_snapshot jsonb;
ALTER TABLE subscription_addon_checkout_intents
  ADD COLUMN IF NOT EXISTS account_discount_snapshot jsonb;
ALTER TABLE subscription_renewal_invoices
  ADD COLUMN IF NOT EXISTS account_discount_snapshot jsonb;