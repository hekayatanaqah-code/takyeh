---
name: WhatsApp receipt identity and approved terms
description: Owner-editable receipt identity must follow the booked property, including insurance deductions and proof links.
---
Detailed WhatsApp receipts belong in the owner's editable message settings. Headers and footers must use the actual booked property's name and the configured platform name, never historical hardcoded brands.

**Why:** The user explicitly requested full control of the detailed receipt and removal of old property/platform names.

**How to apply:** Keep `{اسم_العقار}` and `{اسم_المنصة}` dynamic in receipt templates. Resolve `{الشروط_والأحكام}` from the approved terms of the property linked to the booking, not whichever property the owner currently has open. Insurance proof links must not bypass the terms or footer.
