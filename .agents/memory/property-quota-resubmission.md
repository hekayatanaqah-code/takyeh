---
name: Property quota and resubmission
description: Owner capacity rules for rejected/cancelled properties and resubmission.
---

Rejected and cancelled properties must not consume the owner's property quota. A rejected sole property in a one-property plan must leave usage at 0 / 1 and allow adding another property or resubmitting while the subscription remains active.

**Why:** The user explicitly requested this behavior. The dashboard previously treated all historical requests as capacity-consuming even though the server already excluded rejected requests.

**How to apply:** Use the server's quota usage for both counters and add-property controls, never the total historical request list length. Only pending, approved, and needs-revision properties reserve capacity; avoid adding a database enum merely to express exclusion of cancelled records.

Rejected properties should open their previous data for correction and return the same request to pending review, preserving its identity and the rejection note for administrative context. They must acquire capacity under the same owner lock as new property creation.

**Why:** The user requested resubmission without re-entering all previous data. A freed slot may have been consumed by another property before resubmission, and simultaneous resubmissions must not exceed the plan.

**How to apply:** Recheck subscription, quota, and current request status before the status transition. Preserve ordinary edits to approved properties and the existing needs-revision flow.
