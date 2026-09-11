---
name: Customer calendar bounds
description: Scope minimum-date restrictions to customer booking calendars without limiting owner history review.
---

Customer-facing booking and search calendars must receive local today as `minDate`. When a minimum exists, both Hijri and Gregorian views disable past days and prevent previous-month navigation at the boundary. Owner-dashboard calendars must not inherit this minimum.

**Why:** Customers must not search or book past dates, while owners need unrestricted access to previous months for operational and historical review. UTC date strings can also shift “today” relative to the user’s local day.

**How to apply:** Pass a locally formatted Gregorian `YYYY-MM-DD` only from customer-facing callers. Keep the shared picker’s restriction conditional on `minDate`, and verify both bounded and unbounded modes whenever navigation behavior changes.