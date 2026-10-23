---
name: Notification display boundary
description: Arabic notification presentation must not alter stored deduplication keys or action URLs.
---
Keep internal notification markers out of user-visible text without rewriting stored messages or WhatsApp action URLs. Apply Arabic text cleanup, RTL alignment, dual-calendar footers and monetary formatting consistently across notification filters.

**Why:** Subscription and booking reminder markers prevent duplicate delivery. Removing them from storage to fix their appearance would break that protection; rewriting an action URL can corrupt its encoded message.

**How to apply:** Treat readability changes as presentation transformations, preserve original notification data, and test internal markers separately from visible content and outbound links.
