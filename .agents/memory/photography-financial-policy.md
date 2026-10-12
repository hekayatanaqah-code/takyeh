---
name: Photography financial policy
description: Approved refund scope, shared owner wallet and settlement boundaries
---
The owner wallet is shared between photography and owner subscriptions, not restricted to photography. Admins may issue either full or partial photography refunds, choosing the amount under the platform's policy.

**Why:** The user explicitly selected “استرداد كامل أو جزئي” and “التصوير واشتراكات المالك”.

**How to apply:** Preserve the existing Moyasar merchant. Do not interpret those selections as permission to refund automatically when a photographer declines, invent cancellation percentages, or open the staged photography service.

Keep photographer fees pending until actual delivery. Refunds against already settled work must preserve the historical bank-transfer record and expose the resulting amount recoverable from future earnings, rather than pretending a bank transfer was reversed.

**Why:** Money already transferred outside the app cannot be undone by changing a balance or deleting a ledger row.

**How to apply:** Serialize refunds and settlements, reserve uncertain refunds against available fees, and retain attached receipts even if the underlying session is later refunded.

The staged wallet checkout pays a whole invoice from wallet funds; mixed wallet/card checkout is not part of this rollout.

**Why:** Splitting payment safely requires a reserved wallet amount, gateway reconciliation of the remainder, and recovery of both payment sources on timeout. Reusing the old full-card amount would risk double charging.

**How to apply:** State the full-balance requirement explicitly. If mixed payments are requested later, design those reservation and reconciliation rules before enabling the combination.
