---
name: Database declaration refresh
description: Required declaration refresh after editing the shared Drizzle schema.
---

After changing the shared database schema, regenerate the database package TypeScript declarations before typechecking the API server.

**Why:** The API project can resolve the composite database package through previously emitted declarations, so its typecheck may report that newly added columns do not exist even though the source schema is correct.

**How to apply:** Run the database package's composite TypeScript emit first, then run the API typecheck and build. Do not treat the stale-column errors as a reason to weaken route typing.