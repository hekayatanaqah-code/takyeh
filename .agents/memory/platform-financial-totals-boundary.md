---
name: Platform financial totals boundary
description: Authorization and client-cache policy for platform-wide financial summaries in administration.
---

Only the general supervisor may see platform-wide revenue, expenses, profit, or booking revenue totals. Delegated statistics and finance-settings permissions may expose nonfinancial counts and settings, but never those aggregate amounts. Staff actions must retain the authenticated employee's name in the central audit log.

**Why:** Financial settings and aggregate finance are distinct privileges; a statistics response or a reused browser cache can otherwise reveal totals even while the budget page itself is hidden. Employee attribution must not depend on a name supplied by the client.

**How to apply:** Check API response fields as well as route guards when adding admin metrics. Separate or clear role-sensitive cached data when the admin identity changes, and derive audit names from authenticated server-side staff records before mutations.