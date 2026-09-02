---
name: Shared cancellation dialog
description: Approved cancellation UX shared by property and service booking flows.
---

The cancellation experience for service bookings should use the same approved dialog as property bookings rather than maintaining a separate service-specific variant.

**Why:** The user explicitly confirmed that the shared dialog, refund limits, cancellation revenue summary, and required detailed “other” reason match the intended design.

**How to apply:** When extending cancellation behavior, preserve the shared component and its validation rules across both booking types.