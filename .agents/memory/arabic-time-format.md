---
name: Arabic time storage format
description: DB stores check-in/out times as Arabic AM/PM text; convert at the UI boundary only.
---

## Rule
The `chaletsTable` columns `morningCheckIn`, `morningCheckOut`, `eveningCheckIn`, `eveningCheckOut`, `fullDayCheckIn`, `fullDayCheckOut` store times as Arabic 12-hour strings with Arabic-Indic digits: e.g. `"٦ ص"` (6 AM), `"٤ م"` (4 PM), `"١٢ م"` (12 PM). The format may or may not have a space between the digit and the period marker, and may have leading whitespace.

**Do NOT change the DB storage format.** Convert only at the UI boundary.

## Dual-table sync pattern
Time fields exist in **both** `chaletSubmissionsTable` (draft/edit source) and `chaletsTable` (live/approved source). `PATCH /owner/submissions/:id` writes to `chaletSubmissionsTable` only by default. Any field that lives in BOTH tables must be explicitly mirrored to `chaletsTable` in that route — exactly like `reminderEnabled/reminderDays`. Without this mirror, edits in AddChalet are invisible to the calendar and public pages even after a hard refresh, because `/owner/chalets` reads from `chaletsTable`.

## How to apply
- **Loading into a `<input type="time">`**: call `arabicTimeTo24h(value)` from `@/lib/utils` to get `"HH:MM"`.
- **Saving back to the API**: call `time24hToArabic(value)` from `@/lib/utils` to restore the Arabic string.
- Both functions handle null/undefined (return `""`), already-HH:MM strings, and already-Arabic strings gracefully.
- The display component `ChaletDiamondContent.tsx` renders the raw DB value directly — this is intentional and correct, since Arabic format is the desired display format for guests.

**Why:** The DB was seeded with Arabic text before `<input type="time">` was used. Migrating storage format would require a data migration; converting at the boundary is safer and keeps the display layer unchanged.

## Separate service appointment boundary
The legacy Arabic-storage rule above applies to property check-in/out times, not the optional time of an individual service appointment. Service appointments use a Saudi local wall-clock time in 24-hour `HH:mm` format, without timezone conversion or invented times for historical bookings.

**Why:** The user requested changing an individual service appointment's time without deleting its booking. A native time input needs an unambiguous value; that is independent of the established property check-in/out format.

**How to apply:** Keep service times optional and render Eastern digits at the presentation boundary. Do not use this addition as permission to migrate property time strings or impose hourly exclusivity on a daily-capacity service.

## Unified service-booking editing
Use the primary «تعديل» action as the only entry for editing a service booking. Do not add a separate «تعديل الموعد» action to its card or options menu. Group the date, optional time and required edit reason together inside the general edit dialog.

**Why:** The user explicitly removed the duplicate scheduling action and requested compact, unified editing like the property workflow.

**How to apply:** Preserve the existing rescheduling save, capacity validation and calendar refresh; change the entry point and field organization, not the booking identity or financial values. The user explicitly scoped this unification to service bookings only, not properties. Creation and editing must show the same optional Saudi-local time field, without assigning a default time to historical bookings.
