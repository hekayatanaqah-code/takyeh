---
name: Shared owner customer identity
description: Why property and service bookings use one customer identity while preserving denormalized booking history.
---

Treat a normalized phone number as one customer identity per owner across property and service bookings. Keep the customer master record for future form autofill, but retain name, phone, and service details on each booking as historical snapshots.

**Why:** Owners expect a customer known from either side of the business to be recognized in every new-booking form. Replacing booking snapshots with references alone would make old bookings change when customer details are updated.

**How to apply:** Normalize Saudi local and international phone variants at API boundaries. New bookings should atomically upsert the shared customer and write their own snapshot; lookup may migrate matching historical bookings into the customer master on first use.