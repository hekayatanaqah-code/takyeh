---
name: Moyasar refund confirmation
description: Current refund response identity and safe handling of uncertain outcomes
---
Moyasar's documented refund response is a payment object: its ID is the original payment ID, its amount is the original charge, and its refunded amount is cumulative. Do not require a separate refund object or treat that payment ID as a unique refund ID.

**Why:** Official documentation checked on 2026-10-12 differs from the older subscription reconciliation assumptions. A successful partial or full refund can otherwise remain unresolved indefinitely.

**How to apply:** Consult https://docs.moyasar.com/api/payments/05-refund-payment and verify payment identity, currency, original amount, invoice linkage and the exact expected cumulative refund. Support a legacy response only with equally strong verification.

Persist the attempt before sending money. An uncertain POST must stay pending and be reconciled by reading provider state; a failed later GET is not proof that the earlier refund failed.

**Why:** Releasing an ambiguous attempt on a verification error permits another card or wallet refund against money already returned externally.

**How to apply:** Do not blindly resubmit a partial refund or mark success from a browser response. Keep uncertain amounts reserved and show an honest pending state until provider confirmation.

For subscription reconciliation, a persisted idempotency key is evidence of a reserved attempt, not permission to submit it again. A legacy standalone success or failure is insufficient without payment-level evidence.

**Why:** The current refund contract does not establish an independently queryable refund identity or guaranteed replay behavior. Releasing or replaying an unresolved attempt can return money twice.

**How to apply:** Poll after the first reserved POST, retain its timestamp and key through read failures, and verify the exact full-charge cumulative total for subscription reconciliation. A pre-existing partial total requires review rather than another full-charge POST.
