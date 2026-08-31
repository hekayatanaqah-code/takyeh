---
name: Print-flow verification
description: Reliable design and automated verification rules for browser print flows.
---

For service receipts, the visible receipt DOM is the only rendering source. Native printing must reveal that same element, and WhatsApp attachments must export that element directly; never keep a receipt-specific HTML builder, cache, hidden template, or generic report-renderer fallback.

**Why:** A separate receipt template repeatedly drifted from the approved on-screen design and produced clipped attachments. WhatsApp URL links cannot attach a local file, so file-capable Web Share is required, with a manual-download fallback.

**How to apply:** Resolve the exact visible receipt container by its stable DOM id for both print and WhatsApp. On every WhatsApp click, run a new DOM capture and construct new Blob and File objects; never retain an object URL or generated file between clicks. Wait for fonts and images, capture without changing CSS or width, and center it on one A4 page. Stub native print during automation, inspect print-media rendering, and validate the shared file's name, MIME type, `%PDF` signature, page count, rendered first page, and object identity across consecutive clicks. Use an Arabic underscore-separated document title for browser saving; name the WhatsApp PDF with the Western receipt serial only. Share exactly one generated file through Web Share, falling back to downloading that same blob plus opening the WhatsApp text.