---
name: Hijri and Gregorian date controls
description: How subscription and admin dates should combine dual calendar selection with local time.
---

The calendar toggle changes the selected and emphasized calendar, but both Hijri and Gregorian dates remain visible with their own era labels. Preserve the exact time of day separately whenever an expiry previously had a time component.

**Why:** Converting a picked date through UTC midnight can show the wrong calendar day or expire a discount earlier than the administrator selected. Mixed Arabic text and numeric times also need explicit direction rather than inherited RTL.

**How to apply:** Use the shared dual-calendar picker to select a Gregorian storage date, convert a full timestamp to the user's local date before formatting, and keep time inputs LTR. For manual subscription expiry, an explicitly selected end date overrides a duration; don't silently replace a paid quote's stored terms.

Multi-date closure calendars must be passive when opened or navigated: only an explicit day click may close or reopen a date.

**Why:** Single-date pickers may initialize a selection on opening; applying that behavior to closures would silently block today without the photographer's intent.

**How to apply:** Keep multi-date closure behavior opt-in so existing single-date consumers retain their behavior. Store the same Gregorian day regardless of the displayed calendar.