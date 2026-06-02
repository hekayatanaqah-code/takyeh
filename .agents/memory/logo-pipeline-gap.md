---
name: Logo pipeline gap pattern
description: Admin approval and direct-add flows copy chalet submission fields to chaletsTable explicitly — any field not listed is silently NULL in production.
---

## Rule
When admin.ts approves a chalet submission or direct-adds a chalet, it builds an explicit object for `db.insert(chaletsTable).values(...)`. Every new field added to `chaletSubmissionsTable` schema MUST also be added to:
1. The approval flow insert (~line 366 in admin.ts)
2. The direct-add `vals` object + Zod schema (~line 1599 in admin.ts)
3. The direct-add `chaletsTable` insert (~line 1716 in admin.ts)

**Why:** Drizzle `insert` does not spread `*` — it only inserts what you list. Omitting a field means the DB column stays NULL even when the submission had a valid value. This was discovered when `logoUrl` was added to the schema and upload UI but never showed in search results because the approval copy never included it.

**How to apply:** After adding any new column to `chaletSubmissionsTable`, grep for "direct-add-chalet" and "status.*approved" in admin.ts and add the new field to both flows.
