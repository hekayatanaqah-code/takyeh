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

Revenue year/month filters belong at the right-hand start of their own row, ordered calendar → year → month, including service-only revenue. All three controls must remain side by side on one row, including mobile; never wrap the month below the calendar/year. Keep dropdown text right-aligned in both calendars.

**Why:** The user explicitly reported the filter placement as left-aligned/reversed, then rejected wrapping the month onto a separate line. They require a consistent single-row Arabic layout, not changes to financial calculations.

**How to apply:** Preserve financial filtering behavior; fit the group's widths to mobile without wrapping, and check the alignment inside its menus.

The Revenue page's period, calendar, year/month or custom date fields and revenue-source selector must use the same grouped presentation, readable labels, button sizing and spacing as Financial Reports. Revenue source must not remain an isolated filter outside the group.

**Why:** The user explicitly requested visual and interaction consistency across financial sections, not a new revenue calculation policy.

**How to apply:** Preserve month, year and all-history choices and keep cash custody and refundable insurance separate from period sales. Custom date ranges must filter bookings and quick sales by identical inclusive bounds; incomplete ranges should request dates rather than present zero financial totals.
