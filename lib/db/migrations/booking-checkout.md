# Immutable property-booking departure

Run `pnpm --filter @workspace/scripts exec tsx src/migrate-booking-checkout.ts`
before starting the updated API, against each environment's database through
the normal approved migration process. Do not use a generic schema push.

This additive migration adds `owner_bookings.checkout_at` (`timestamptz`) and
backfills all bookings, including cancelled ones, in one transaction. It locks
booking and property writes while capturing the schedule so no property edit
can race the historical snapshot. It never changes financial, review, status,
date or duration data and never deletes data. Run during a quiet period because
writes wait until the transaction commits.

Policy:
- Existing published-property timings win as a whole; use the submission only
  when no published property exists. Period timings fall back to general timings.
- Missing/invalid departure timings use midnight after the last occupied Saudi
  calendar day. Unavailable historical timings cannot be reconstructed.
- Malformed booking dates stay null, are reported by the migration and remain
  ineligible for settlement/reviews until deliberately rescheduled to a valid date.
- Later null legacy records use the same calendar-end rule and never live timings.
- New bookings pin the current property schedule. Actual date/duration/period
  changes repin it, using current property timings; unchanged fields, notes,
  payments, settlement, cancellation and restore do not repin it.
- API clients cannot supply the pinned instant; the server owns it.
- List/archive classification remains the independent occupied-calendar-day rule.

Reruns do not modify any pin. Column creation and backfill are atomic; do not
manually create the column before running this script.
