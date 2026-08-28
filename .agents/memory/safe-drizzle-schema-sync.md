---
name: Safe Drizzle schema sync
description: How to handle development schema drift when Drizzle proposes unrelated destructive changes.
---

Never force a Drizzle schema push when its diff proposes deleting unrelated legacy tables or populated columns. Apply only the reviewed additive development change needed for the active fix, then reconcile the wider schema drift separately.

**Why:** The development database contains legacy tables and columns that are not fully represented by the current Drizzle schema source, so a routine push can surface broad data-loss operations unrelated to the requested change.

**How to apply:** Inspect every push diff before confirming it. Abort on unrelated drops, use narrowly scoped additive development DDL only when required to restore an already-declared column, and create a separate task to bring schema ownership back into alignment.