---
name: Data-driven month/year select disabling
description: Pattern for disabling dropdown options that have no underlying data, not just future dates.
---

When a month/year selector represents a reporting period (bookings, expenses, reports), disabling
only *future* options is not enough — past periods with zero actual data (no bookings, no expenses)
are equally useless to select and should also render disabled, EXCEPT the current period (must stay
selectable even if empty, since it's still "in progress").

**Why:** users landed on empty past months and saw a blank report with no indication that was
expected vs. a bug; only blocking future months missed that case entirely.

**How to apply:**
1. Fetch the full unfiltered dataset (all bookings + all expenses, not just the selected month) so
   presence can be checked across every period at once.
2. Build a `Set<string>` of period keys (e.g. `"YYYY-MM"`) that actually have data, one per calendar
   system in use (e.g. separate Hijri/Gregorian sets) if the app supports dual calendars — reuse the
   same month-key helper the rest of the codebase already uses for consistency.
3. Recompute the set whenever the active property/entity filter changes (it should be scoped, not
   global) via `useMemo` keyed on the filter + raw datasets.
4. Disable an option when `isFuture || (isPastPeriod && !hasData)`, always excluding the current
   period from the "empty past" check.
5. When the user changes the year (or other parent selector) and the naive/previously-selected month
   would resolve to a disabled option, auto-correct to the latest period that *does* have data within
   the new selection, rather than leaving the UI on a disabled/invalid value.
