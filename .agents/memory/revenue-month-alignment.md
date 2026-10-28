---
name: Revenue month alignment
description: User-confirmed scope and repeated alignment requirement for Gregorian month options.
---
The Gregorian month dropdown must visually match the Hijri dropdown: the main month name and secondary Hijri date share a straight right-aligned edge, never centered.

**Why:** The user repeated this requirement after confirming that the financial calculations and deposit dialog were correct.

**How to apply:** Keep follow-up changes to month layout scoped to that dropdown and preserve the accepted financial behavior. The user subsequently requested the same full-width right alignment for the Hijri menu's Gregorian secondary line; both calendar modes must now use the same aligned two-line layout.

The user's comparison images showed the guest-receivables subtab, identifiable by “كل الشهور” and month labels that include the year, not the monthly-accounts selector. Earlier fixes and isolated previews targeted the similar monthly-accounts menu instead.

**Why:** Repeated fixes on a visually similar but different dropdown could pass isolated checks while leaving the actual reported screen unchanged.

**How to apply:** Match the screenshot's subtab, option labels and surrounding headings before editing or verifying. Preview the actual reported selector, not a substitute from the neighboring subtab.

Revenue year/month filters belong at the right-hand start of their own row, ordered calendar → year → month, including service-only revenue. Keep dropdown text right-aligned in both calendars.

**Why:** The user explicitly reported the filter placement as left-aligned/reversed and requested logical Arabic positioning, not changes to financial calculations.

**How to apply:** Preserve financial filtering behavior; check the filter group's placement and mobile wrapping as well as the alignment inside its menus.
