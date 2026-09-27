---
name: Admin permission compatibility
description: Preserving existing administrative staff access while splitting broad legacy permissions into finer controls.
---

When splitting a broad administrative permission into a narrower one, existing staff should retain their previous access while the new permission is unset. A saved explicit false must override the legacy grant; newly created accounts should start with explicit false for each permission so grants remain independent.

**Why:** Existing staff permissions are persisted as partial JSON objects. Treating an absent newly introduced key as false would unexpectedly lock them out of previously accessible sections; treating it as a permanent alias would make the new permission impossible to revoke independently.

**How to apply:** Normalize the effective values when editing existing staff, and keep the frontend's visibility calculation and backend authorization consistent. Avoid granting access to previously inaccessible sections through a broader legacy fallback.