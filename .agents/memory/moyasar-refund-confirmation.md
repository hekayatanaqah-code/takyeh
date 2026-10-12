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
