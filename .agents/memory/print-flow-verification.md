---
name: Print-flow verification
description: Reliable design and automated verification rules for browser print flows.
---

Keep printable HTML generation separable from the native `window.print()` invocation, and bound asynchronous image embedding so a slow logo cannot leave the print window stuck on a loading message. Receipt PDF actions must use this same browser print flow rather than a separate PDF renderer.

**Why:** Browser automation cannot reliably inspect native print dialogs and may terminate its session when the dialog opens. Capturing the HTML written to a stubbed print window verifies the real template and CSS without invoking the system dialog. A separate PDF generator can drift visually from the approved print layout.

**How to apply:** Build the final document before invoking print, set an Arabic underscore-separated document title so browser “Save as PDF” suggests the correct filename, let direct print rendering proceed even if image-to-data-URL conversion is slow, and test generated HTML/CSS by temporarily replacing `window.open` with a compatible capture object.