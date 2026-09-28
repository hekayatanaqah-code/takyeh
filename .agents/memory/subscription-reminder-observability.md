---
name: Subscription reminder observability
description: How to interpret expiry reminder status for administrators.
---

An expiry reminder marked successful means the scheduled in-app notification check completed; an individual entry means an in-app notification was persisted. Neither establishes external message delivery or that a scheduler remains running after the recorded check.

**Why:** Administrators need truthful diagnostics for the five-day, three-day, and expiry-day milestones. A historical heartbeat or notification cannot prove a future run or delivery through an external channel.

**How to apply:** Label timestamps and statuses by what was actually persisted. Distinguish a stale or missing check from a failed check; only claim external delivery if a real delivery provider supplies that status.