---
name: Synthetic fixture identity integrity
description: Mock dashboard data must preserve real identifier relationships to avoid hiding authorization failures.
---

Synthetic dashboard bootstrap responses must retain the same identity relationships as real API responses. Do not substitute a registration identifier for a published-resource identifier merely to make a downstream endpoint pass.

**Why:** A successful offers browser journey used a simplified dashboard fixture whose identifiers differed from the real owner-property response. The fixture concealed a caller mismatch that later produced ownership errors for real owners, despite passing pricing and CRUD tests.

**How to apply:** Prefer real owner inventory GET responses in browser fixtures. Where mocking is necessary, use distinct identifiers for registrations and published resources and verify the caller translates them according to the downstream contract. Correct the identifier boundary rather than weakening authorization.

Public search fixtures must also satisfy the real inventory's availability rules, not just have a price that a standalone quote can calculate.

**Why:** A partial weekday-price grid can exclude an otherwise priced fixture from public search before discount calculation. Testing pricing with an unintentionally closed weekday produces misleading failures.

**How to apply:** Make the tested weekday and period explicitly bookable unless closure itself is the scenario, and keep the subscription active. Assert fixture presence separately from its calculated discount.
