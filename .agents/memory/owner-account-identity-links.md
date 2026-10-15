---
name: Owner account identity links
description: Durable identity and compatibility rules for owner and service-provider account profiles.
---

Owner account settings must authorize and update profiles through a durable one-to-one mapping from the authenticated user ID to the owner application ID. Email may bootstrap a verified first link, but must not remain the lookup key for profile reads, writes, or owner aliases.

**Why:** Email is mutable and legacy data may contain duplicates. Re-resolving by email after authentication can expose or update another owner's data, split a profile after an email change, or make concurrent profile creation nondeterministic.

**How to apply:** Carry the mapped application ID through all profile operations. Keep `owner_N` sessions as legacy aliases without consuming an external-user link. Before aggregating owner-wide property/service activity, canonicalize both aliases or one person can split into two owners. Serialize first-link creation and target-email changes, and synchronize explicit phone changes—including clearing—to every linked property and service record.

Treat `owner_N` as a reserved application alias, not an external user identity, even if historical account-link data contains such a value.

**Why:** A historical alias link can point at another application's reserved ID. Blind canonicalization then collapses two real registrations into one, despite one-to-one link constraints. A correct password can consequently open the wrong profile; checking the password alone does not verify the resolved identity.

**How to apply:** Ignore reserved aliases when deriving an external canonical user ID. Apply this rule to authenticated profile resolution as well as directory aggregation. Do not repair or delete historical links silently; keep each actual registered account distinct and use its own reserved alias when no valid external link exists.