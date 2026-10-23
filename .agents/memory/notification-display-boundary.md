---
name: Notification display boundary
description: Arabic notification presentation must not alter stored deduplication keys or action URLs.
---
Keep internal notification markers out of user-visible text without rewriting stored messages or WhatsApp action URLs. Apply Arabic text cleanup, RTL alignment, dual-calendar footers and monetary formatting consistently across notification filters.

**Why:** Subscription and booking reminder markers prevent duplicate delivery. Removing them from storage to fix their appearance would break that protection; rewriting an action URL can corrupt its encoded message.

**How to apply:** Treat readability changes as presentation transformations, preserve original notification data, and test internal markers separately from visible content and outbound links.

Notification quick periods use Saudi local calendar boundaries, with Sunday as the start of “this week”; they are not rolling 24-hour, 7-day or 30-day windows.

**Why:** A calendar-period filter should remain consistent with the Saudi locale and the dates displayed on the cards, including around midnight.

**How to apply:** Use Asia/Riyadh boundaries for notification date filters and retain an unrestricted period option.
