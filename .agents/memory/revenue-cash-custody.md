---
name: Revenue cash custody
description: Keep outstanding cash distinct from monthly revenue and use the detail records as the card's source.
---
Outstanding cash (“كاش لم يودع / عهدة معلقة”) is a custody balance, not the remainder of monthly collections after subtracting all-time bank transfers and deposits. Its card must match the sum of the exact records displayed in its details, under the same property scope.

**Why:** The user reported zero on the card while the details contained 850. Mixing a monthly collection figure with cumulative bank figures caused the contradiction; an earlier visual-only fix did not address it.

**How to apply:** Keep the card, detail total and deposit-dialog presentation synchronized. Refresh the financial source after mutations. Changes to how deposits reduce outstanding custody must reconcile booking-level records and partial deposit logs, not mask differences by clamping a mixed-period calculation to zero.
