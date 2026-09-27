---
name: Subscription plan identifiers
description: Why subscription plan identifiers should be automatic but immutable after creation.
---

Generate a unique identifier from the plan name when creating a subscription plan, but do not regenerate or change the identifier when its display name is edited.

**Why:** Active and historical owner subscriptions refer to the identifier, not the displayed name. Changing it during a rename could disconnect an existing subscription from its plan or make payment confirmation resolve the wrong configuration.

**How to apply:** Treat the identifier as an internal creation-time key. Allow edits to the Arabic display name independently, and resolve collisions among new plans without changing any existing key.