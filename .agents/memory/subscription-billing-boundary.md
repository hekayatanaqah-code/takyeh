---
name: Subscription billing boundary
description: Billing boundary for paid extra slots and legacy trial continuity.
---

An additional property or service slot is a separate one-time purchase. It remains attached to the owner's linked account across subscription renewals, but is usable only while a base subscription is active. Plan and add-on pricing are editable; a checkout keeps its original quoted amount and terms.

**Why:** The user authorized temporary defaults and unrestricted future edits by the general administrator. Repricing or modifying a plan after checkout must not alter a charge already initiated or strip a buyer's purchased entitlement.

**How to apply:** Keep over-limit creation blocked until a separately quoted, verified, recorded payment unlocks an additional slot. Admin edits apply to new checkouts; existing paid terms remain as quoted. A paid buyer must not lose a slot simply because the base subscription expired during payment: retain it for their next renewal.

An active property-only subscription can purchase a service slot, and an active service-only subscription can purchase a property slot, without replacing the base subscription. Default cross-category add-on prices should be enabled only once for untouched seeded plans; later administrator edits, including disabling a price, must remain authoritative.

**Why:** A buyer asked to pay only for extra capacity, not an entirely new plan. Yet a recurring seed that fills disabled prices would undo the administrator's future decision.

**How to apply:** Treat the add-on as a separate, owner-scoped purchase counted toward effective capacity regardless of base plan category. Keep the base subscription intact and avoid rewriting configured prices on later starts.

For legacy accounts with published inventory but no subscription record, a single persisted trial prevents the new system from silently removing active listings on rollout. An already-recorded expired or inactive subscription is not a missing trial and must not be reset.

**Why:** Absence of a row in the old system did not prove that an owner had used a trial; an existing expired row does prove previous entitlement and should remain expired.

**How to apply:** When migrating or joining owner identities, check all linked aliases before issuing a trial; a linked paid subscription takes precedence over a second trial.

Removing obsolete plans from the catalog is different from deleting historic billing evidence. Old plans with no references may be deleted once; those referenced by an owner subscription, checkout quote, or payment must be archived and hidden from selection instead.

**Why:** A clean administrator list must not erase the terms or identity needed to interpret an older customer's subscription and payment.

**How to apply:** Keep current purchasable and grantable catalogs free of legacy plans while retaining referenced records for entitlement lookup and audit history. Do not re-seed the removed plans at startup.