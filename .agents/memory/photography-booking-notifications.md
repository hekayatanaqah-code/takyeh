---
name: Photography booking notification boundaries
description: When reservations become appointments and how internal notices differ from WhatsApp delivery
---
Treat the owner's temporary unpaid slot hold as a reservation, not a confirmed photographer appointment. Appointment cards, occupied-session calendars and booking-confirmation notices correspond to payment-verified confirmed bookings.

**Why:** Sending confirmation when a slot is merely held would notify the photographer of sessions that may never be paid for and later expire. The existing photography flow sells sessions through Moyasar before confirming them.

**How to apply:** Persist the photographer's internal notice with the successful confirmation transaction, deduplicate retries, and emit live updates only after commit. Internal readability and WhatsApp-provider delivery status are independent; unavailable WhatsApp must not prevent an internal notice.

Calendar occupancy is derived from booking intervals, not written into the photographer's manually closed dates or weekly availability.

**Why:** A booked session must exclude only overlapping slots. Turning a single session into a manually closed day would incorrectly remove remaining availability and mix customer purchases with photographer preferences.

**How to apply:** Keep manual closures unchanged when a booking confirms, and refresh appointment/calendar data from the confirmed booking source.
