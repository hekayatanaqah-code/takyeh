---
name: Digital contract property terms
description: Contract settings and generated documents must use the selected property's saved conditions without automatic legal clauses.
---
Property contract terms come from that property's saved settings. Do not insert stock legal clauses when loading settings, previewing, generating or printing contracts, including when no terms exist. Show an explicit empty-terms message instead.

**Why:** The user requested removal of old hardcoded conditions, including automatic labour charges. Previous settings logic could silently add stock clauses or replace customized conditions that resembled the beginning of a default clause.

**How to apply:** Preserve the owner's entire saved wording even if it starts like an old default. Do not delete existing persisted clauses merely because they resemble old stock content; the owner controls them. Customer-facing contract links and copied signature URLs use the verified published platform domain, never the current development origin. Recheck deployment metadata when the platform domain changes.

Service digital-contract management must match the approved property contract-management structure and styling: logo card, colored summary boxes, archive table and filtering. Keep a service-specific editable terms-and-conditions field.

Property contract settings must offer a live, clearly marked sample of the final customer document, including the property's current logo, saved terms and Saudi-local current date. Reuse the real document renderer rather than another approximate template; previewing must never create a booking, signature or message.

**Why:** The owner explicitly requested seeing the final contract before sending it, without changing real customer records.

**How to apply:** Keep illustrative names and amounts labelled as samples, and show unsaved logo edits immediately without presenting the sample as a real signed contract.

**Why:** The user explicitly requested full visual and structural parity with the property standard, while retaining each service's own terms.

**How to apply:** Use the existing property interface as the visual reference rather than inventing a separate service design. Preserve service-scoped data, wording, signature options and links; visual parity must never query or change property contracts or terms.
