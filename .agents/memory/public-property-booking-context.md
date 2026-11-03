---
name: Public property booking context
description: Honest room-count badges and unambiguous selected periods in public WhatsApp enquiries.
---

An omitted room count must remain absent from search-card badges, not be advertised as «0 غرف».

**Why:** The user requires hiding the badge when the owner has not configured a room count.

**How to apply:** Keep room-count display conditional; do not populate missing owner data merely to satisfy presentation.

Public property WhatsApp enquiries must carry the customer's actual available period. A sole available period may be selected automatically; multiple available periods require an explicit choice before opening WhatsApp.

**Why:** The user requires a meaningful Arabic period beside «الفترة»; guessing a period from the default price would misrepresent the booking request.

**How to apply:** Preserve selection across search, details and the terms-confirmation step. Normalize legacy search/detail period aliases at the display boundary rather than rewriting historical booking values. Do not emit raw period keys or an empty period label.
