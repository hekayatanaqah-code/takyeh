-- Additive-only migration for recurring add-on billing and saved-token consent.
-- Existing add-on rows remain recurring=false and therefore grandfathered.
ALTER TABLE owner_subscriptions
  ADD COLUMN IF NOT EXISTS billing_cycle_days integer,
  ADD COLUMN IF NOT EXISTS renewal_price_halala integer,
  ADD COLUMN IF NOT EXISTS auto_renew_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE subscription_checkout_intents
  ADD COLUMN IF NOT EXISTS invoice_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_renew_consent boolean NOT NULL DEFAULT false;

ALTER TABLE subscription_addon_checkout_intents
  ADD COLUMN IF NOT EXISTS monthly_unit_price_halala integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_charge_halala integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS base_monthly_halala integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_days integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_billing_at timestamptz,
  ADD COLUMN IF NOT EXISTS cycle_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS quoted_base_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS period_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS period_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_renew_consent boolean NOT NULL DEFAULT false;

ALTER TABLE subscription_addon_purchases
  ADD COLUMN IF NOT EXISTS recurring boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS monthly_unit_price_halala integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS period_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_through_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS owner_billing_profiles (
  owner_id text PRIMARY KEY,
  encrypted_payment_token text,
  token_payment_id text,
  auto_renew_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscription_renewal_invoices (
  id serial PRIMARY KEY,
  owner_id text NOT NULL,
  period_start_at timestamptz NOT NULL,
  period_end_at timestamptz NOT NULL,
  given_id text NOT NULL UNIQUE,
  base_plan text NOT NULL,
  cycle_days integer NOT NULL,
  base_price_halala integer NOT NULL,
  amount_halala integer NOT NULL,
  line_items jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  payment_id text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_renewal_owner_period_unique
  ON subscription_renewal_invoices(owner_id, period_start_at);
CREATE INDEX IF NOT EXISTS subscription_renewal_due_idx
  ON subscription_renewal_invoices(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS subscription_renewal_attempts (
  id serial PRIMARY KEY,
  invoice_id integer NOT NULL,
  attempt_number integer NOT NULL,
  given_id text NOT NULL UNIQUE,
  payment_id text,
  status text NOT NULL DEFAULT 'pending',
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_renewal_invoice_attempt_unique
  ON subscription_renewal_attempts(invoice_id, attempt_number);
CREATE INDEX IF NOT EXISTS subscription_renewal_attempt_due_idx
  ON subscription_renewal_attempts(status, next_attempt_at);
