---
name: Transaction ledger versus bank statement
description: Financial transaction history unifies collected revenues and expenses, unlike the deposited-only bank statement.
---
«سجل المعاملات المالية» must automatically include property booking collections and installments, service collections, historical quick sales, refunds and scoped expenses. It is not «سجل الحساب البنكي»: cash revenues belong in transaction history even before deposit.

**Why:** The user reported missing revenue movements beside expenses and requested synchronized revenue, expense and net-income cards.

**How to apply:** Apply the same owner identity, selected activity and period to movements and cards. Keep the bank statement's deposited-only rules unchanged. Sum in halalas, and do not count an installment twice through a fully-paid flag. Include historical sales even when their entry feature is disabled.

Unpaid contractual amounts and refundable insurance are not collected income. Show receivables separately; subtract recorded refunds, expenses and the existing personal-withdrawal classification from collected income for this ledger's net figure. Moving cash to the bank must not create a second revenue.

**Why:** The ledger combines different revenue sources and can otherwise double-count receipts or misrepresent liabilities as income.

**How to apply:** Use recorded principal collections, preserve cancellation refunds and retained amounts, and derive the displayed cards from exactly the rows selected by the activity and calendar filters. Failed reads must display an error and unavailable totals, not fabricated zero balances.

Retained principal from cancelled bookings remains collected revenue in both property and service sections. Recognize it on the Saudi-local cancellation date, not the cancelled future appointment date. A cancelled booking has no remaining contractual receivable. Cancelled quick sales remain excluded.

**Why:** The pre-launch audit found the ledger retained this money while revenue cards and reports discarded cancelled bookings, producing contradictory totals. The user required identical accounting across all three surfaces and their exports.

**How to apply:** Preserve the same financial-event date and net retained principal in monthly, annual and custom-period filters, payment-status filters, totals and detail rows. Expense ownership must use the activity identity: a service expense does not become a property expense merely because its property link is empty.

The ledger may retain separate gross collection and refund movements for audit, but its revenue card is net of those displayed refunds. The refund card is informational; do not subtract the refund a second time when deriving net income from already-net revenue.

**Why:** Comparing gross ledger receipts to net retained cancellation income otherwise gives contradictory revenue cards even though the final balance agrees.

**How to apply:** Attribute cancelled-booking collections, related installments and refunds to the same cancellation period in the revenue ledger; leave actual bank-deposit history unchanged.
