---
name: Support ticket workflow
description: Admin reply/status synchronization and human-readable owner identity in support.
---
An administration reply puts its support ticket in «تم الرد». Manual changes to «جديد»، «قيد المعالجة» or «تم الحل» remain authoritative even if an older reply still exists. All badges, tabs and counters must describe the same current state; reply existence alone must not create a contradictory status badge.

**Why:** The user reported conflicting «تم الرد» and «قيد المعالجة» labels after sending replies and requested automatic, synchronized updates.

**How to apply:** Save the reply and resulting state together; only update the interface after server success. Keep unread-reply tracking separate from workflow state. Refresh both support lists and administrative pending-work counts, and preserve an unsent reply when saving fails.

Support administration must display the real owner or activity name, not identifiers such as «owner_79», including for owners without property submissions.

**Why:** The user explicitly requested human-readable identities for following up support requests.

**How to apply:** Resolve reserved owner aliases directly to their registration and external identities through verified durable links. An erroneous historical link must not retarget a reserved alias. Never change authorization based on a display name or expose an internal identifier as the name fallback.
