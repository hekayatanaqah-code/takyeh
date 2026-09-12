---
name: Global versus private seasons
description: Product and data boundary between centrally managed calendar seasons and owner-specific pricing seasons.
---

Keep centrally managed seasons separate from owner-created seasonal pricing. Global seasons are active calendar annotations enabled for every property by default; owners may explicitly disable each one per property.

**Why:** Copying global definitions into private pricing rows would couple public awareness labels to owner pricing and make later admin edits inconsistent across properties.

**How to apply:** Customer search calendars use all active global seasons. Property booking calendars additionally honor explicit per-submission opt-outs. Owner private season CRUD and pricing precedence remain unchanged.