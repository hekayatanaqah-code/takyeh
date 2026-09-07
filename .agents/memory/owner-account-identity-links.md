---
name: Owner account identity links
description: Durable identity and compatibility rules for owner and service-provider account profiles.
---

Owner account settings must authorize and update profiles through a durable one-to-one mapping from the authenticated user ID to the owner application ID. Email may bootstrap a verified first link, but must not remain the lookup key for profile reads, writes, or owner aliases.

**Why:** Email is mutable and legacy data may contain duplicates. Re-resolving by email after authentication can expose or update another owner's data, split a profile after an email change, or make concurrent profile creation nondeterministic.

**How to apply:** Carry the mapped application ID through all profile operations. Keep `owner_N` sessions as legacy aliases without consuming an external-user link. Serialize first-link creation and target-email changes, and synchronize explicit phone changes—including clearing—to every linked property and service record.