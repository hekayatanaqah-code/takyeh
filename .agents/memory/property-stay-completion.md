---
name: Property stay completion
description: Owner-requested timing boundaries for property insurance, booking-linked reviews and completed-booking archives.
---

Property bookings remain active until the actual departure time for their booked period and duration, including overnight stays. Insurance receipt may be recorded before arrival, but refunds and damage deductions must wait until check-out. Booking-linked review invitations must not be sent, opened or submitted before completion; old links must recheck a rescheduled booking.

**Why:** The user explicitly requested these financial and review timing restrictions and automatic separation of completed bookings from the main list.

**How to apply:** Use Saudi time regardless of the server or visitor timezone. Completion must mean the same thing for insurance, reviews and archiving, and restrictions must be enforced by the server as well as the interface. Archiving is a display classification, never deletion; retain insurance and review actions in the completed archive.

If no usable departure schedule exists, use the end of the last occupied Saudi calendar day rather than midnight at the start of that day. Honor existing general arrival/departure settings when period-specific settings are absent.

**Why:** Legacy records can lack period schedules; guessing an earlier departure could permit settlement while the guest is still staying.

**How to apply:** Keep this conservative fallback consistent across server and browser. Unlinked general review invitations retain their existing behavior because they have no booking from which to establish a departure.
