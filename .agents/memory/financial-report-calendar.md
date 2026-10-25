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

Financial reports use year-first selection, followed by only that year's nonempty financial months, newest first. Do not retain an empty current month or year as an exception in this section.

**Why:** The user explicitly asked to hide empty financial periods, including the previously retained current period, and avoid long mixed-year lists.

**How to apply:** Scope financial periods to the selected property, service or unified activity. Exclude cancelled, zero-value and future records, include owner-wide property expenses, and reconcile an unavailable selection to the latest real period. This report-specific rule does not change other sections' current-month exceptions.

Financial report print/PDF output uses the literal abbreviation «ر.س» in one nonwrapping, directionally isolated block beside its amount, with the footer «منصة تكيّة — تقرير مالي».

**Why:** The user explicitly requested this currency presentation and a unified platform-only footer for financial reports.

**How to apply:** Keep these report-specific choices separate from the platform's general riyal artwork convention. Zero page margins and empty page-margin boxes suppress native browser furniture where supported; never promise to override every browser's user-controlled header/footer setting.

The financial reports section has its own activity filter, initially «جميع الأنشطة». Selecting a property or service scopes its report and updates both the screen and PDF heading to «التقرير المالي - [اسم النشاط]».

**Why:** The user explicitly requested activity-specific financial reports and matching titles inside the reports section.

**How to apply:** Do not change the global dashboard activity to implement this filter. Keep published property IDs distinct from submission IDs, filter service totals by provider, and reset report-local export/share state when changing activity.
