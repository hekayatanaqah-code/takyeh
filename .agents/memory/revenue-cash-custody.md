---
name: Revenue cash custody
description: Keep outstanding cash distinct from monthly revenue and use the detail records as the card's source.
---
Outstanding cash (“كاش لم يودع / عهدة معلقة”) is a custody balance, not the remainder of monthly collections after subtracting all-time bank transfers and deposits. Its card must match the sum of the exact records displayed in its details, under the same property scope.

**Why:** The user reported zero on the card while the details contained 850. Mixing a monthly collection figure with cumulative bank figures caused the contradiction; an earlier visual-only fix did not address it. The user explicitly confirmed the financial corrections and deposit dialog were correct; subsequent month-alignment requests must not reopen that accepted financial work.

**How to apply:** Keep the card, detail total and deposit-dialog presentation synchronized. Refresh the financial source after mutations. Changes to how deposits reduce outstanding custody must reconcile booking-level records and partial deposit logs, not mask differences by clamping a mixed-period calculation to zero.

Keep the guest-receivables total label fixed as «إجمالي المبالغ المتبقية», not a dynamic sales-period title.

**Why:** The user explicitly distinguishes current outstanding guest balances from monthly, annual and all-time sales reporting.

Cash deposits are entered from «تسجيل إيداع بالبنك» in booking-calendar details, not a collection-channel section in the revenue tab.

**Why:** The user chose booking-linked deposits and explicitly required preserving historical data, revenue cards, bank statements and financial reports.

**How to apply:** Do not reintroduce the general collection-channel panel or general deposit action into revenue when changing financial displays.

**How to apply:** Apply dynamic sales titles only to monthly-accounts sales. Do not change the receivables calculation or current custody balances when extending sales-period filters.
