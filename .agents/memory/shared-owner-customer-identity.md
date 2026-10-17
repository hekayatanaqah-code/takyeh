---
name: Shared owner customer identity
description: Why property and service bookings use one customer identity while preserving denormalized booking history.
---

Treat a normalized phone number as one customer identity per owner across property and service bookings. Keep the customer master record for future form autofill, but retain name, phone, and service details on each booking as historical snapshots.

**Why:** Owners expect a customer known from either side of the business to be recognized in every new-booking form. Replacing booking snapshots with references alone would make old bookings change when customer details are updated.

**How to apply:** Normalize Saudi local and international phone variants at API boundaries. New bookings should atomically upsert the shared customer and write their own snapshot; lookup may migrate matching historical bookings into the customer master on first use.

In the customer database, display mobile numbers with Eastern Arabic digits, including edit and delete dialogs. Show both Hijri and Gregorian dates throughout customer summaries and booking, contract and insurance histories, with the owner's booking-calendar preference first.

**Why:** The owner explicitly requested consistent platform identity and preference-aware dual dates, not a change to stored phone identities or booking dates.

**How to apply:** Convert digits only at the display/input boundary. Customer notes should save smoothly with visible, truthful status; do not report success before the server accepts a write or mix pending drafts between customers.

Customer history must scale without downloading every booking into the browser. Bookings, signed contracts and insurance histories use ten-record server pages, with search and filters applied before pagination. Booking history pins active/upcoming bookings, then orders each group newest first; contracts and insurance use chronological descending order without pinning. Equal dates require a deterministic tie-breaker.

**Why:** The owner explicitly requested scalable customer profiles, newest-first histories, pinned active/future stays, internal booking/date search and pages of 10–15 records.

**How to apply:** Keep full-customer summary totals separate from the current page. Property activity uses the authoritative Saudi checkout boundary, not merely a missing cancellation timestamp. Keep notes mounted when switching history pages or filters.