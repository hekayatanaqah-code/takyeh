---
name: Service capacity atomicity
description: Concurrency rule for enforcing daily service-booking capacity.
---

Every service appointment operation that consumes a daily slot—creation, moving to another date, or reactivating a cancelled booking—must serialize the capacity check and write with the same provider-and-date transaction lock.

**Why:** A separate count followed by insert/update allows two requests for the final slot to succeed concurrently, even when both the UI and API appear to check capacity.

**How to apply:** Acquire the provider/date advisory transaction lock before counting active appointments, then perform the capacity check and write in that transaction. Use the same lock key across every route that can consume a slot.