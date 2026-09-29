-- Persist one Moyasar idempotency key per refund submission attempt. The key
-- remains stable across ambiguous outcomes and is rotated only after a verified
-- terminal provider failure.
ALTER TABLE subscription_payment_reconciliations
  ADD COLUMN IF NOT EXISTS refund_attempt_number integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_attempt_key text;