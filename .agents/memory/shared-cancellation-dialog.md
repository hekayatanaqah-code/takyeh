---
name: Shared cancellation dialog
description: Approved cancellation UX shared by property and service booking flows.
---

The cancellation experience for service bookings should use the same approved dialog as property bookings rather than maintaining a separate service-specific variant.

**Why:** The user explicitly confirmed that the shared dialog, refund limits, cancellation revenue summary, and required detailed “other” reason match the intended design.

**How to apply:** When extending cancellation behavior, preserve the shared component and its validation rules across both booking types.

Shared presentation does not imply identical insurance settlement. A service cancellation does not itself return refundable insurance: it stays held until a separate settlement is recorded. Show actual principal paid, retained principal and recorded insurance settlement independently.

**Why:** The pre-launch audit found a service cancellation displaying the contract total as paid and promising a full insurance return without a matching settlement. The user explicitly required honest cancellation and WhatsApp amounts.

**How to apply:** Keep the approved property behavior unchanged; supply the service's real insurance state to shared cancellation views. Zero principal or insurance refunds must appear as zero, not a dash or an implied transfer.