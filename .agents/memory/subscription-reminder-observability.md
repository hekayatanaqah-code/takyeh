---
name: Subscription reminder observability
description: How to interpret expiry reminder status for administrators.
---

An expiry reminder marked successful means the scheduled in-app notification check completed; an individual entry means an in-app notification was persisted. Neither establishes external message delivery or that a scheduler remains running after the recorded check.

**Why:** Administrators need truthful diagnostics for the five-day, three-day, and expiry-day milestones. A historical heartbeat or notification cannot prove a future run or delivery through an external channel.

**How to apply:** Label timestamps and statuses by what was actually persisted. Distinguish a stale or missing check from a failed check; only claim external delivery if a real delivery provider supplies that status.

WhatsApp click-to-chat is a prepared manual message, not automated delivery. Even after a staff member opens the link, the app cannot know whether the message was sent or read.

**Why:** A WhatsApp URL opens a composer but supplies no delivery acknowledgement. Marking it as sent would mislead administrators and owners.

**How to apply:** Show the recipient and renewal link in the prepared message; label its status as ready or unconfirmed, never sent. Use the account holder's profile phone rather than a property's public contact number.