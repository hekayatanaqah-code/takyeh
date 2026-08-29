---
name: Mixed-owner data scoping
description: Prevents chalet and service records from leaking across tabs for owners who operate both product types.
---

Any dashboard tab opened for a selected service must use provider-linked data and authorization; do not mount a chalet-only component merely because its visual layout is reusable.

**Why:** Mixed owners can otherwise see or operate on chalet records while believing they are managing an individual service, which is a product-scope integrity failure even when owner authorization is valid.

**How to apply:** Reuse presentation patterns, but give service tabs provider-scoped endpoints and query keys. Include both service-only and mixed-owner scenarios when testing.