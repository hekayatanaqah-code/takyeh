---
name: Approved service publishing source
description: Canonical source and synchronization rule for accepted service-provider requests.
---

The admin “active and published services” list uses approved service-provider submissions as its canonical source. The service providers table is the public marketplace mirror created when approval succeeds.

**Why:** A legacy manual-services table caused accepted provider requests to appear under reviews but not in the published-services administration list. Older approved requests can also predate the durable submission-to-provider link.

**How to apply:** New admin publishing views must read approved provider submissions, not manually entered external services. Approval must create or link one provider row using the durable submission identifier so public marketplace inventory stays synchronized.

Service approval conflict targets must support the legacy partial unique index on non-null submission links, not assume a full unique constraint merely because the schema declares uniqueness.

**Why:** The live database can retain a partial index from an additive migration; PostgreSQL rejects a conflict target without its predicate even for a new, non-duplicate service, causing approval to return 500.

**How to apply:** Match the non-null predicate in the conflict target; this is compatible with partial and full unique indexes. Preserve transactional submission locking and verify concurrent approvals without changing or rebuilding existing database indexes.

Category corrections outside the approval flow must update the canonical submission and its linked public provider atomically, while preserving approval and publication state.

**Why:** Correcting only one source makes administration and public search disagree; later synchronization can also restore the old category. A classification correction does not authorize publishing, pausing, or reapproving the service.

**How to apply:** Verify the intended record, original category, durable provider link, and target catalog entry before writing. Persist the audit intent first, then commit both category updates together. Ambiguous classifications require an explicit user choice, not inference from the business name.