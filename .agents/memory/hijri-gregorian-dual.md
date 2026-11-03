---
name: Hijri and Gregorian date controls
description: Dual-calendar selection, era labels and responsive date presentation.
---

Homepage booking-date fields must keep the complete Hijri date, including compound month names and «هـ», on one unbroken line.

**Why:** The user reported the era suffix wrapping below «جمادى الأولى / جمادى الآخرة» and explicitly requested a single-line presentation across screen sizes.

**How to apply:** Adjust the homepage field's font, padding and responsive width without truncating the date, dropping the era suffix, or changing calendar conversion and selection behavior. Preserve the secondary Gregorian date.

The calendar toggle changes the selected and emphasized calendar, but both Hijri and Gregorian dates remain visible with their own era labels. Preserve the exact time of day separately whenever an expiry previously had a time component.

**Why:** Converting a picked date through UTC midnight can show the wrong calendar day or expire a discount earlier than the administrator selected. Mixed Arabic text and numeric times also need explicit direction rather than inherited RTL.

**How to apply:** Use the shared dual-calendar picker to select a Gregorian storage date, convert a full timestamp to the user's local date before formatting, and keep time inputs LTR. For manual subscription expiry, an explicitly selected end date overrides a duration; don't silently replace a paid quote's stored terms.

Multi-date closure calendars must be passive when opened or navigated: only an explicit day click may close or reopen a date.

**Why:** Single-date pickers may initialize a selection on opening; applying that behavior to closures would silently block today without the photographer's intent.

**How to apply:** Keep multi-date closure behavior opt-in so existing single-date consumers retain their behavior. Store the same Gregorian day regardless of the displayed calendar.

Owner «متابعة الطلبات» cards show Umm al-Qura Hijri plus explicit Gregorian, Eastern digits and a single era suffix for each. Property dates remain stacked; service dates share one clear row, wrapping only when needed on narrow screens.

**Why:** The user asked for both calendars in request cards, then specifically requested one full date row in the redesigned service request card.

**How to apply:** Convert full timestamps to the Saudi-local day; do not slice the UTC date or rely on the locale's default calendar. Hide absent or invalid timestamps rather than inventing a date.