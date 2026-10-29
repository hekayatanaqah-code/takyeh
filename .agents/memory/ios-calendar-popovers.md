---
name: iOS calendar overlays
description: WebKit-safe modal, touch, scrolling, and date-format rules for the shared calendar UI.
---

All user-visible date inputs must use the shared modal-overlay picker; do not use `input[type="date"]` anywhere in the web interface. The calendar must be centered independently of its trigger, suppress automatic focus on open, and explicitly keep enabled day buttons at `pointer-events: auto` with touch manipulation. On first open, an empty picker selects today (or the nearest allowed bound), synchronizes both calendar views, and keeps the Gregorian `YYYY-MM-DD` value while switching Hijri/Gregorian. Read Umm al-Qura components with a Latin-digit locale and validate month/day ranges before using them.

**Why:** On iPhone WebKit, an anchored popover can conflict with focus, touch dispatch, nested dialogs, and viewport repositioning. Safari can also return an Arabic month name from `formatToParts` despite `month: "numeric"`; parsing that as an integer yields month 0, an `undefined` title, and an empty day grid.

**How to apply:** Search the frontend for native date inputs before shipping. Test a public picker and a picker nested inside an owner dialog at iPhone size; verify a real Arabic Hijri month name, a nonempty grid, today selection, enabled-day computed pointer events, switching, Escape, parent-dialog survival, and constrained-height scrolling. Always specify `calendar: "gregory"` for Arabic Gregorian labels because `ar-SA` may default to Hijri.

## Employee dates are historical

Employee birth and hiring dates require realistic historical year choices ending today, not the default future-booking range. Apply the same behavior in add and edit forms, and never silently correct already-saved dates.

**Why:** The user explicitly reported unrealistic future Hijri years in employee forms and requested matching, historically appropriate dates.

**How to apply:** Constrain employee pickers without removing future dates from booking calendars. Switching calendars must navigate through an actual Gregorian day rather than reusing a year number or an independently stale navigation state. Opening an optional employee field should not invent a birth or hiring date.