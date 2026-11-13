---
name: WhatsApp provider evidence
description: Diagnose OTP delivery failures using actual redacted provider responses, not documentation alone.
---

When Taqnyat delivers an OTP but the site reports failure, establish the actual
provider response shape from redacted runtime evidence before changing success
conditions. Do not treat an example in the provider documentation as the complete
response contract.

**Why:** Production template responses differed from the documented WhatsApp
example. Documentation-only changes left the same failure in place. Delivery to
the handset also does not prove the OTP database transaction committed: a rollback
cannot retract an already delivered WhatsApp.

**How to apply:** Separate provider acceptance, persistence and frontend state.
Reproduce the observed response structurally with fake identifiers in tests.
Keep OTPs, credentials, recipient details and real message identifiers out of
reports, fixtures and logs.
