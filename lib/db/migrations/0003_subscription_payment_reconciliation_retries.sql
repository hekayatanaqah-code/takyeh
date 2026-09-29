-- Durable, idempotent retry state for captured subscription payments requiring refund.
ALTER TABLE subscription_payment_reconciliations
  ADD COLUMN IF NOT EXISTS refund_eligible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS refund_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

-- The previous implementation could submit a refund before persisting its outcome.
-- Treat existing unresolved rows as potentially submitted so the retry worker only
-- polls/verifies them and never blindly resubmits a possibly successful refund.
UPDATE subscription_payment_reconciliations
SET refund_requested_at = COALESCE(refund_requested_at, created_at),
    status = CASE WHEN status = 'required' THEN 'refund_pending' ELSE status END,
    last_error = COALESCE(last_error, 'Legacy refund outcome unknown; verify provider state without resubmitting'),
    updated_at = now()
WHERE status IN ('required', 'refund_pending')
  AND refund_requested_at IS NULL;

CREATE INDEX IF NOT EXISTS subscription_payment_reconciliations_retry_idx
  ON subscription_payment_reconciliations (status, next_attempt_at, locked_at);