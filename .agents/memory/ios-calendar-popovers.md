---
name: iOS calendar popovers
description: WebKit-safe positioning, scrolling, and date-format rules for the shared calendar UI.
---

Calendar interfaces should use the shared portal-based picker rather than absolute menus, fixed backdrops, or relying on Safari’s RTL native date control for primary booking flows. Bound the popover to Radix’s available-height variable and the dynamic viewport, with internal momentum scrolling and permanent collision sticking.

**Why:** On iPhone WebKit, a reopened calendar can flip above its trigger and extend beyond the viewport even when the first opening fits. The application also scrolls through `#root`, so `body` overflow and `window.scrollY` do not describe actual page lock.

**How to apply:** Test against `#root.scrollTop`, reopen after selecting a future month, and verify internal scrolling when vertical space is constrained. Always specify `calendar: "gregory"` for Arabic Gregorian labels because `ar-SA` may default to Hijri.