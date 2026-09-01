---
name: Service capacity atomicity
description: Concurrency rule for enforcing daily service-booking capacity.
---

Every service appointment operation that consumes a daily slot—creation, moving to another date, or reactivating a cancelled booking—must serialize the capacity check and write with the same provider-and-date transaction lock. Blocking a service date must use that identical lock before checking active appointments and writing the block.

**Why:** A separate count followed by insert/update allows two requests for the final slot to succeed concurrently. If date blocking uses a different lock (or none), a block and booking can both succeed and leave an active appointment on a closed day.

**How to apply:** Acquire the provider/date advisory transaction lock before checking blocked dates or active appointments, then perform the validation and write in that transaction. Use the same lock key across booking and date-blocking routes.