---
name: Safe Drizzle schema sync
description: How to handle development schema drift when Drizzle proposes unrelated destructive changes.
---

Never force a Drizzle schema push when its diff proposes deleting unrelated legacy tables or populated columns. Apply only the reviewed additive development change needed for the active fix, then reconcile the wider schema drift separately.

**Why:** The development database contains legacy tables and columns that are not fully represented by the current Drizzle schema source, so a routine push can surface broad data-loss operations unrelated to the requested change.

**How to apply:** Inspect every push diff before confirming it. Abort on unrelated drops, use narrowly scoped additive development DDL only when required to restore an already-declared column, and create a separate task to bring schema ownership back into alignment.

Integration-test fixtures must also tolerate known drift in the development database. Before seeding a legacy table through a schema-generated insert, verify the real columns; if Drizzle emits an absent optional column, seed only the required existing columns with narrowly scoped SQL rather than mutating the shared database.

**Why:** Drizzle may include schema-declared columns in generated `INSERT` statements even when the fixture omits their values, so an unrelated absent column can make a valid regression test fail before reaching the behavior under test.