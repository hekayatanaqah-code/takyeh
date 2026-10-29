---
name: Bank ledger accounting
description: Bank summary versus table filters, signed expenses and recorded-data boundaries.
---
Bank summary cards represent the selected unit's full recorded history. Date/type filters narrow the table and its signed subtotal, not the current summary balance.

**Why:** The user asked for current bank balance as deposited inflows minus registered expenses. A current-month subtotal or an expense-only quick filter must not silently redefine that balance.

**How to apply:** Keep scope consistent across credits, debit rows and summary cards. Recorded expenses, including personal withdrawals, are debits under the requested formula. There is currently no expense funding-source distinction; do not invent cash-versus-bank provenance for historical expenses.

Display bank-statement debits with an explicit leading minus and red text, using an isolated numeric run in RTL. This bank-specific user request takes precedence over the platform's general parenthesized negative presentation.

**Why:** The user explicitly requested red amounts such as -150 in the bank statement.

**How to apply:** Keep halalas, use Eastern digits and the approved riyal artwork. Cash reaches the bank through deposit records; never add it a second time solely because a booking flag is set. Installments must not also be inferred from a fully-paid booking flag.

Completed quick sales received by bank transfer count as deposited revenue in the bank statement and current bank balance, just like bank-funded bookings. Use their original sale records, not a second synthetic booking or deposit; cash quick sales and cancelled sales are not bank credits.

**Why:** The user explicitly requires individual bank sales to appear with their details in the statement and reconcile exactly with deposited revenue and net bank balance.

**How to apply:** Include historical sales even when quick-sales entry is disabled, preserve activity scope and halalas, and use the same credit rows for table and summary calculations. Accounting cancellation removes the credit without implying an electronic refund.
