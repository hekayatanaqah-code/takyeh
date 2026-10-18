---
name: Revenue month alignment
description: User-confirmed scope and repeated alignment requirement for Gregorian month options.
---
The Gregorian month dropdown must visually match the Hijri dropdown: the main month name and secondary Hijri date share a straight right-aligned edge, never centered.

**Why:** The user repeated this requirement after confirming that the financial calculations and deposit dialog were correct.

**How to apply:** Keep follow-up changes to month layout scoped to that dropdown. Preserve the accepted financial behavior and the existing Hijri appearance.

The user's comparison images showed the guest-receivables subtab, identifiable by “كل الشهور” and month labels that include the year, not the monthly-accounts selector. Earlier fixes and isolated previews targeted the similar monthly-accounts menu instead.

**Why:** Repeated fixes on a visually similar but different dropdown could pass isolated checks while leaving the actual reported screen unchanged.

**How to apply:** Match the screenshot's subtab, option labels and surrounding headings before editing or verifying. Preview the actual reported selector, not a substitute from the neighboring subtab.
