---
name: Approved service publishing source
description: Canonical source and synchronization rule for accepted service-provider requests.
---

The admin “active and published services” list uses approved service-provider submissions as its canonical source. The service providers table is the public marketplace mirror created when approval succeeds.

**Why:** A legacy manual-services table caused accepted provider requests to appear under reviews but not in the published-services administration list. Older approved requests can also predate the durable submission-to-provider link.

**How to apply:** New admin publishing views must read approved provider submissions, not manually entered external services. Approval must create or link one provider row using the durable submission identifier so public marketplace inventory stays synchronized.