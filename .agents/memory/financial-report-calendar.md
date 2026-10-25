---
name: Financial report calendar
description: Saved financial calendar preference, temporary switching, explicit locale calendars and service period boundaries.
---
The user's saved primary financial-report calendar governs the initial report, month lists and annual view. A local calendar switch is temporary and must not silently change the saved account preference. Exports use the currently displayed calendar, period and activity.

**Why:** The user explicitly requested financial reports to follow account settings while retaining a flexible switch to the other calendar.

**How to apply:** Read the saved preference before the local cache, apply asynchronous preference changes, and share the active calendar across filters, custom-range grouping, print, PDF and sharing.

Always specify the calendar when formatting Gregorian Arabic dates; an Arabic Saudi locale can default to Umm al-Qura even when the underlying Date was constructed from a Gregorian month.

**Why:** Locale-only formatting can label a Gregorian month/year as Hijri and mislabel secondary dates with a Gregorian era suffix.

**How to apply:** Use explicit gregory or islamic-umalqura in chart labels and report templates. For combined property/service reports, filter both sources by actual boundaries of the chosen calendar month; never present a Gregorian service total under a Hijri month label.
