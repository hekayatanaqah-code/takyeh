---
name: Booking edit audit snapshots
description: Rules for trustworthy service-booking edit badges, detail panels, and customer messages.
---

Only show a booking as modified or rescheduled when an actual edit operation persisted the relevant before/after values. Never backfill an edit timestamp from the booking creation timestamp.

**Why:** Inferring an edit from creation metadata produced a purple “modified” panel with no real change details, while WhatsApp could repeat the same date as both old and new.

**How to apply:** For date, price, or duration changes, persist an explicit snapshot of both sides during the update transaction. Build UI details and message variables from that snapshot, and cover PATCH persistence plus GET retrieval with an integration test.