---
name: Multi-role authentication boundaries
description: Shared contacts discover independent roles; password selection and role-specific session lifetime
---
Allow one person to be an owner, photographer and authorized administrator using the same phone/email, without merging those role records.

**Why:** The user reported owner/photographer account overlap and explicitly chose to retain password login with a role selector, rather than introduce OTP login.

**How to apply:** Discover matching roles after one credential succeeds, but authenticate each selected role against its own credential. A different role password requires an additional prompt; shared contact information or a successful owner login must never grant administrative access.

Owner and photographer sessions must coexist; logging out of either must not invalidate the other. Protected shared resources must authorize the explicitly selected role, never fall through to another valid role cookie.

**Why:** The user requested session isolation. Both directions of independent login/logout were confirmed in a real browser.

**How to apply:** Retain role-specific session scopes, clear role-specific client state on identity changes, and keep password-owner logout local instead of invoking external SSO logout. Preserve ordinary owner identities via durable account links, not email equality; privileged identities cannot be inherited by choosing the owner role.

Purely numeric login passwords accept equivalent Western, Eastern Arabic and Persian digits. Do not transliterate letters-and-digits passwords or trim password whitespace; retain exact verification for historical credentials.

**Why:** The user required Arabic and English digit entry to work for numeric credentials. Treating every Unicode digit in every password as interchangeable would change unrelated passwords and break existing credential semantics.

**How to apply:** Apply the same verification rule at initial login and when a selected role requires its own password. Keep role proofs and session authorization independent of shared contact information.

Owner access and account setup must remain blocked until a correct phone OTP
has been matched in the database. Failed delivery, an incorrect code, a password
login, or manually opening a setup URL must not substitute for phone verification.

**Why:** The user reported that an owner could bypass failed WhatsApp verification
and explicitly required a strict server-side gate, including account setup.

**How to apply:** Enforce the gate on the server and on previously issued owner
sessions, not just navigation controls. Preserve the independent administrator,
photographer and employee authorization boundaries above.
