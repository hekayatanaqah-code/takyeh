-- Mark unpaid intents when superadmin free access is granted. This is additive;
-- captured payments remain reconcilable while no-charge redemptions can be blocked.
ALTER TABLE subscription_checkout_intents
  ADD COLUMN IF NOT EXISTS free_access_blocked_at timestamptz;

ALTER TABLE subscription_addon_checkout_intents
  ADD COLUMN IF NOT EXISTS free_access_blocked_at timestamptz;