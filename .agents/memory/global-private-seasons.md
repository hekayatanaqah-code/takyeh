---
name: Global versus private seasons
description: Product and data boundary between centrally managed calendar seasons and owner-specific pricing seasons.
---

Keep centrally managed seasons separate from owner-created seasons. Administration controls each global season's shared name and date range. Each property controls whether it is enabled and stores its own morning, evening, full-day, and optional per-date prices on the property-season association.

**Why:** Copying global definitions into private season rows would make later admin edits inconsistent across properties. Storing prices on the association lets properties share the managed date range without sharing prices.

**How to apply:** Customer calendars use active global seasons and honor per-property opt-outs. Booking pricing checks owner-created seasons first, then enabled priced global seasons, then the property's base prices.