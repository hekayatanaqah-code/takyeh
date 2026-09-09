---
name: iOS calendar overlays
description: WebKit-safe modal, touch, scrolling, and date-format rules for the shared calendar UI.
---

All user-visible date inputs must use the shared modal-overlay picker; do not use `input[type="date"]` anywhere in the web interface. The calendar must be centered independently of its trigger, suppress automatic focus on open, and explicitly keep enabled day buttons at `pointer-events: auto` with touch manipulation. On first open, an empty picker selects today (or the nearest allowed bound), synchronizes both calendar views, and keeps the Gregorian `YYYY-MM-DD` value while switching Hijri/Gregorian.

**Why:** On iPhone WebKit, an anchored popover can conflict with focus, touch dispatch, nested dialogs, and viewport repositioning. A fixed modal overlay isolates calendar interaction and lets only the calendar close after a nested selection.

**How to apply:** Search the frontend for native date inputs before shipping. Test a public picker and a picker nested inside an owner dialog at iPhone size; verify enabled-day computed pointer events, switching, Escape, parent-dialog survival, and constrained-height scrolling. Always specify `calendar: "gregory"` for Arabic Gregorian labels because `ar-SA` may default to Hijri.