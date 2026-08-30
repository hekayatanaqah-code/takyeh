---
name: Print-flow verification
description: Reliable design and automated verification rules for browser print flows.
---

Keep printable HTML generation separable from the native `window.print()` invocation, and bound asynchronous image embedding so a slow logo cannot leave the print window stuck on a loading message. For WhatsApp attachments, export the already-rendered receipt DOM directly; never pass a rebuilt receipt HTML string through the generic report PDF renderer.

**Why:** Browser automation cannot reliably inspect native print dialogs and may terminate its session when the dialog opens. Capturing the HTML written to a stubbed print window verifies the real template and CSS without invoking the system dialog. Rebuilding receipt markup inside a hidden iframe drifted visually from the approved receipt, while WhatsApp URL links cannot attach a local file and therefore require Web Share (with a manual-download fallback).

**How to apply:** Keep a ref on the visible receipt container, wait for its fonts and images, and pass that element directly to the canvas capture. Preserve its live width instead of forcing a clone width, which can create asymmetric blank space. Center the capture on A4 with the print margin. Use an Arabic underscore-separated document title for browser saving; name the WhatsApp PDF with the Western receipt serial only. Share exactly one generated file through Web Share, falling back to downloading that same blob plus opening the WhatsApp text.