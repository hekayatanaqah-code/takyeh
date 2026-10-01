---
name: Password recovery boundaries
description: Identity, channel consent, and honest delivery constraints for owner account recovery.
---

User-initiated password recovery is transactional, not a broadcast. Do not gate it on marketing notification preferences or require an optional email when the owner registered with a phone.

**Why:** Owners may opt out of marketing and still need access recovery. The registered destination's possession is proved by the single-use recovery link; legacy phone-verification flags do not consistently represent actual verification.

**How to apply:** Deliver only to the unique stored account destination through a functioning provider. Provider-wide unavailability must fail before account lookup, and unavailable channels must never produce a usable token or a delivery-success claim.

Owner password sessions need an explicit owner-application identity. Legacy email-based session matching may only bridge unlinked password-auth sessions when the owner email is unique and no durable mapping conflicts.

**Why:** Historical password logins can use an external user ID without an account link; revoking only owner aliases misses them, while broad email matching can revoke another account's sessions.

**How to apply:** Prefer the explicit application identity and durable mapping for revocation. Serialize recovery-link issuance and consumption on the same account lock and reject issuance based on an obsolete password snapshot.