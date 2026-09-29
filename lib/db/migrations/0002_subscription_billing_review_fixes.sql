-- Additive safety fields for immutable checkout snapshots and captured-payment reconciliation.
ALTER TABLE subscription_checkout_intents
  ADD COLUMN IF NOT EXISTS quoted_base_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS recurring_addon_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE subscription_addon_purchases
  ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1;

ALTER TABLE subscription_addon_checkout_intents
  ADD COLUMN IF NOT EXISTS quote_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS subscription_payment_reconciliations (
  id serial PRIMARY KEY,
  payment_id text NOT NULL UNIQUE,
  owner_id text NOT NULL,
  intent_id text NOT NULL,
  amount_halala integer NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'required',
  refund_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);