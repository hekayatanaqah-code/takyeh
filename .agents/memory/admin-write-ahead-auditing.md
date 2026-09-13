---
name: Admin write-ahead auditing
description: Reliability rule for recording privileged administration changes.
---

Every privileged administration mutation must create a durable, server-attributed audit record before the business operation starts. The record is finalized as completed or failed before the response; if finalization fails, the initial record remains for investigation.

**Why:** Writing audit entries after a mutation can leave a successful sensitive change completely unaudited. Returning an error after the change has already committed can also encourage unsafe retries.

**How to apply:** Cover every state-changing admin method, derive actor and action on the server, never store request bodies or credentials, and prevent the mutation when the initial audit write fails.