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
