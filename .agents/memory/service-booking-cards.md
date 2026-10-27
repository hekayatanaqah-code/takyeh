---
name: Service booking cards
description: User-required parity with property cards and safe boundaries for additive service collections.
---

Service bookings use the property bookings' card presentation in both the booking register and day details: customer/contact/service details, a colored bottom financial strip, and horizontally arranged quick actions.

**Why:** The user explicitly requested replacing the traditional service-booking text table with cards matching property bookings exactly.

**How to apply:** Preserve visual parity without mounting property-only data or mutations. Keep the previously approved service time picker intact and keep editing/rescheduling unified under «تعديل».

Additional collections use the existing booking's payment method and custody classification; do not silently introduce mixed payment methods or partial bank-deposit accounting.

**Why:** This request changes presentation and adds a quick collection action, not a new per-installment financial ledger. Reclassifying all prior money to match a new payment would corrupt the accepted balances.

**How to apply:** Explain the classification before confirmation, including that new cash marked deposited must already be in the bank. Addition must reject stale payment snapshots, duplicate concurrent submissions, cancelled bookings, and amounts beyond the remaining balance. Expand mixed-method accounting only as separately requested work.
