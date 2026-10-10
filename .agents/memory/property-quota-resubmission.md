---
name: Property quota and resubmission
description: Owner capacity rules for rejected/cancelled properties and resubmission.
---

Rejected and cancelled properties must not consume the owner's property quota. A rejected sole property in a one-property plan must leave usage at 0 / 1 and allow adding another property while the subscription remains active.

**Why:** The user explicitly requested this behavior. The dashboard previously treated all historical requests as capacity-consuming even though the server already excluded rejected requests.

**How to apply:** Use the server's quota usage for both counters and add-property controls, never the total historical request list length. Only pending, approved, and needs-revision properties reserve capacity; avoid adding a database enum merely to express exclusion of cancelled records.

Rejection is final: the request cannot be edited, resubmitted, or reopened by administration. Retain the historical record and rejection reason rather than physically deleting it. Only requests returned for revision reopen with their previous data and return the same request to pending review.

**Why:** The user explicitly superseded the earlier rejected-request resubmission behavior: rejection now closes the request permanently, while return-for-revision is the editable decision.

**How to apply:** Keep pending, approved, and needs-revision requests counted. Resending a needs-revision request uses its already-reserved slot even when the plan is full. Guard all edit/resubmission paths against concurrent final rejection. Approval publishes one mirror of the latest submission data; revision/rejection deactivate its public mirror.
