---
name: Permanent owner deletion
description: Product meaning of deleting an owner and the data-isolation boundaries it must preserve.
---

Deleting an owner from administration means permanent database removal of the
account, its properties, services and associated operational/financial records,
not archiving the registration alone.

**Why:** The user explicitly requested complete deletion; removing just the
registration left inventory behind and made the directory recreate a ghost owner.

**How to apply:** Resolve durable owner aliases before deletion, include public
inventory mirrors whose owner field may be empty, and roll back the entire
operation on failure. Explicitly warn about permanence before confirmation.
Preserve other owners, shared catalogs, independently authorized roles and the
administrative audit trail. Deleting records is not authorization to refund or
otherwise move money.
