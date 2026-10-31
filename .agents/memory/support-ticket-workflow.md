---
name: Support ticket workflow
description: Admin reply/status synchronization and human-readable owner identity in support.
---
An administration reply puts its support ticket in «تم الرد». Manual changes to «جديد»، «قيد المعالجة» or «تم الحل» remain authoritative even if an older reply still exists. All badges, tabs and counters must describe the same current state; reply existence alone must not create a contradictory status badge.

**Why:** The user reported conflicting «تم الرد» and «قيد المعالجة» labels after sending replies and requested automatic, synchronized updates.

**How to apply:** Save the reply and resulting state in one explicit database transaction, and return the complete updated ticket only after commit. The interface must immediately consume that saved ticket rather than wait for a reload or infer state from the draft. Keep unread-reply tracking separate from workflow state. Refresh both support lists and administrative pending-work counts, and preserve an unsent reply when saving fails.

Support tickets are ongoing conversations, not a single editable administrative answer. Owners may send multiple follow-ups on the same open ticket; an owner follow-up returns it to administrative processing, and a subsequent admin reply sets «تم الرد» with «رد متاح» on the owner's screen.

**Why:** The user explicitly requested continued two-way correspondence without opening another ticket or manually setting the replied state.

**How to apply:** Append replies without replacing previous messages. Preserve existing replies, attachments and their real timestamps when introducing conversation history; never invent missing historical dates. Keep text and selected files per ticket during polling and failures.

Only an explicit administrative «تم الحل / إغلاق التذكرة» closes a conversation. Closed tickets remain readable but neither party may reply until administration explicitly reopens them.

**Why:** The user required the reply window to remain available until manual closure, then disappear with a clear locked-ticket notice for the owner.

**How to apply:** Enforce closure in both APIs and interfaces, including a reply submitted from a stale open window. Serialize replies against closure, and never reopen a closed ticket as a side effect of sending a reply.

Support administration must display the real owner or activity name, not identifiers such as «owner_79», including for owners without property submissions.

**Why:** The user explicitly requested human-readable identities for following up support requests.

**How to apply:** Resolve reserved owner aliases directly to their registration and external identities through verified durable links. An erroneous historical link must not retarget a reserved alias. Never change authorization based on a display name or expose an internal identifier as the name fallback.
