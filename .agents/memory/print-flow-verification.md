---
name: Print-flow verification
description: Reliable design and automated verification rules for browser print flows.
---

Keep printable HTML generation separable from the native `window.print()` invocation, and bound asynchronous image embedding so a slow logo cannot leave the print window stuck on a loading message. Receipt print, browser PDF saving, and WhatsApp attachment generation must reuse one cached final HTML document; never maintain a second receipt template.

**Why:** Browser automation cannot reliably inspect native print dialogs and may terminate its session when the dialog opens. Capturing the HTML written to a stubbed print window verifies the real template and CSS without invoking the system dialog. A separate PDF template can drift visually, while WhatsApp URL links cannot attach a local file and therefore require Web Share (with a manual-download fallback).

**How to apply:** Build and cache the final document before invoking print or attachment rendering. Use an Arabic underscore-separated document title for browser saving; name the WhatsApp PDF with the Western receipt serial only. Share exactly one generated file through Web Share, fall back to downloading that same blob plus opening WhatsApp text, and compare independently captured HTML arguments rather than concatenated test captures.