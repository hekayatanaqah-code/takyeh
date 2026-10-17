---
name: Digital contract property terms
description: Contract settings and generated documents must use the selected property's saved conditions without automatic legal clauses.
---
Property contract terms come from that property's saved settings. Do not insert stock legal clauses when loading settings, previewing, generating or printing contracts, including when no terms exist. Show an explicit empty-terms message instead.

**Why:** The user requested removal of old hardcoded conditions, including automatic labour charges. Previous settings logic could silently add stock clauses or replace customized conditions that resembled the beginning of a default clause.

**How to apply:** Preserve the owner's entire saved wording even if it starts like an old default. Do not delete existing persisted clauses merely because they resemble old stock content; the owner controls them. Customer-facing contract links and copied signature URLs use the verified published platform domain, never the current development origin. Recheck deployment metadata when the platform domain changes.
