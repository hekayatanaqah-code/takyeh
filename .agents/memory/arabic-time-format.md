---
name: Arabic time storage format
description: DB stores check-in/out times as Arabic AM/PM text; convert at the UI boundary only.
---

## Rule
The `chaletsTable` columns `morningCheckIn`, `morningCheckOut`, `eveningCheckIn`, `eveningCheckOut`, `fullDayCheckIn`, `fullDayCheckOut` store times as Arabic 12-hour strings with Arabic-Indic digits: e.g. `"٦ ص"` (6 AM), `"٤ م"` (4 PM), `"١٢ م"` (12 PM). The format may or may not have a space between the digit and the period marker, and may have leading whitespace.

**Do NOT change the DB storage format.** Convert only at the UI boundary.

## How to apply
- **Loading into a `<input type="time">`**: call `arabicTimeTo24h(value)` from `@/lib/utils` to get `"HH:MM"`.
- **Saving back to the API**: call `time24hToArabic(value)` from `@/lib/utils` to restore the Arabic string.
- Both functions handle null/undefined (return `""`), already-HH:MM strings, and already-Arabic strings gracefully.
- The display component `ChaletDiamondContent.tsx` renders the raw DB value directly — this is intentional and correct, since Arabic format is the desired display format for guests.

**Why:** The DB was seeded with Arabic text before `<input type="time">` was used. Migrating storage format would require a data migration; converting at the boundary is safer and keeps the display layer unchanged.
