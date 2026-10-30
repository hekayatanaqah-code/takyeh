---
name: Property calendar display
description: Booking identity versus availability mirrors when displaying property calendars.
---
Property calendars must preserve each booking's identity, including simultaneous bookings for different properties in the all-properties view. Availability mirrors describe blocked periods; they must not replace or suppress actual booking records.

**Why:** A single slot label is insufficient when several properties are displayed together, and a full-day block can coexist with real partial-period records. The user requires all active bookings to remain visible.

**How to apply:** Keep Hijri and Gregorian views consistent, show every booking throughout its occupied dates, and keep day details scoped to the same selected properties. Do not change stored bookings to correct a display discrepancy.

Navigating from the owner-wide booking list to a calendar day must align both the property and month, while preserving an existing all-properties selection that already includes the booking.

**Why:** The list can span multiple months and properties while the grid shows only one selected month/scope; a visible list entry alone does not mean its day is currently on the grid.

**How to apply:** Make the list-to-calendar connection explicit without creating availability records or changing booking data to force a visual marker.
