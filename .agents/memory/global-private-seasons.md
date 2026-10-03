---
name: Global versus private seasons
description: Product boundary between centrally managed seasons and owner-created seasons in properties and services.
---

Keep centrally managed seasons separate from owner-created seasons, in both properties and services. Administration controls each global season's shared name and date range; owners must not turn selecting a public season into an independently editable private copy. Each property controls whether it is enabled and stores its own morning, evening, full-day, and optional per-date prices on the property-season association. Service owners can register an approved public season or create a custom season with their own name and dates.

**Why:** The user requested the same public/custom choice for service owners as for properties. Copying global definitions into private seasons would make later admin edits inconsistent across products. Storing owner-specific settings on an association keeps shared definitions centrally controlled.

**How to apply:** Read public names and dates from their current administrative definitions; removing a service's registration must not remove the public definition. Customer property calendars use active global seasons and honor per-property opt-outs. Property booking pricing checks owner-created seasons first, then enabled priced global seasons, then the property's base prices; do not assume service seasons change service pricing.