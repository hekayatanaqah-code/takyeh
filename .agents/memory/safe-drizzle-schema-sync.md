---
name: Safe Drizzle schema sync
description: How to handle development schema drift when Drizzle proposes unrelated destructive changes.
---

Never force a Drizzle schema push when its diff proposes deleting unrelated legacy tables or populated columns. Apply only the reviewed additive development change needed for the active fix, then reconcile the wider schema drift separately.

**Why:** The development database contains legacy tables and columns that are not fully represented by the current Drizzle schema source, so a routine push can surface broad data-loss operations unrelated to the requested change.

**How to apply:** Inspect every push diff before confirming it. Abort on unrelated drops, use narrowly scoped additive development DDL only when required to restore an already-declared column, and create a separate task to bring schema ownership back into alignment.

Automatic post-merge setup must not run generic Drizzle schema pushes, including forced pushes.

**Why:** Even dependency-only merges can trigger interactive truncation prompts against populated legacy tables; adding force flags converts a setup failure into a data-loss risk.

**How to apply:** Keep automatic setup limited to dependency reconciliation and rebuilding shared declarations. The schema-owning task must apply its reviewed migrations explicitly.

A full-table Drizzle `select()` requests every schema-declared column, so one absent development column can surface as an endpoint 500 and masquerade in the UI as an empty dataset. Check the API response and real table columns before changing an empty-state condition.

Integration-test fixtures must also tolerate known drift in the development database. Before seeding a legacy table through a schema-generated insert, verify the real columns; if Drizzle emits an absent optional column, seed only the required existing columns with narrowly scoped SQL rather than mutating the shared database.

**Why:** Drizzle may include schema-declared columns in generated `INSERT` statements even when the fixture omits their values, so an unrelated absent column can make a valid regression test fail before reaching the behavior under test.