---
name: Subscription billing boundary
description: Billing boundary for recurring extra slots, legacy purchases, and trial continuity.
---

The free trial must wait indefinitely before the first activity is accepted and activated by administration. Its month starts at that approval instant, not account creation, login, a settings/catalog lookup, or a background scheduler. Property and service approvals share one account-level trial; later approvals must not restart it or replace paid history.

**Why:** The user explicitly requires the free month to be available for actual operation rather than consumed while an owner awaits approval.

**How to apply:** Preserve first-submission access while awaiting activation. Activate atomically with publication, distinguish waiting from expired in owner/subscription views, and show the activation date rather than account creation as the trial's start.

New additional property or service slots are recurring, prorated through the current base period, and charged alongside the base plan on renewal. Historical one-time purchases keep their original nonrecurring entitlement. Both remain usable only while the base subscription is active. Plan and add-on prices remain editable; a checkout and agreed recurring price keep their quoted terms.

**Why:** The user replaced separate one-time add-on billing with unified renewals, but explicitly kept old one-time purchases grandfathered. Repricing after consent must not silently change an agreed future charge or strip purchased capacity.

**How to apply:** Show the exact days remaining, amount due now, future combined charge and renewal date before obtaining recurring-payment consent. Unlock capacity only after verified payment; on renewal, advance the base and included add-ons together only after one verified combined charge. Admin edits apply to new checkouts, not agreed renewal amounts. Never charge a legacy one-time purchase again.

An active property-only subscription can purchase a service slot, and an active service-only subscription can purchase a property slot, without replacing the base subscription. Default cross-category add-on prices should be enabled only once for untouched seeded plans; later administrator edits, including disabling a price, must remain authoritative.

**Why:** A buyer asked to pay only for extra capacity, not an entirely new plan. Yet a recurring seed that fills disabled prices would undo the administrator's future decision.

**How to apply:** Count the owner-scoped add-on toward capacity regardless of base plan category, but bill and renew new recurring add-ons with the base period. Keep the base subscription intact and avoid rewriting configured prices on later starts.

Trial add-on prices are set by the administrator for each type; do not infer them from paid plans or invent a default charge when no amount has been supplied.

**Why:** The user declined to choose fixed trial prices and instead requested editable prices in the subscription-plan administration screen. A guessed charge would be a billing decision they did not make.

**How to apply:** Permit an active trial to buy as soon as its per-type price is configured. When unset, explain that the administrator has not priced the add-on yet; never silently replace an intentionally empty price with a seed. At trial expiry, require the owner to select a paid plan before any combined renewal; never automatically choose a paid plan for them.

For legacy accounts with published inventory but no subscription record, a single persisted trial prevents the new system from silently removing active listings on rollout. An already-recorded expired or inactive subscription is not a missing trial and must not be reset.

**Why:** Absence of a row in the old system did not prove that an owner had used a trial; an existing expired row does prove previous entitlement and should remain expired.

**How to apply:** When migrating or joining owner identities, check all linked aliases before issuing a trial; a linked paid subscription takes precedence over a second trial.

The fixed free plan's administrator toggle controls only grants to owners who do not yet have a subscription. Disabling it does not revoke an existing trial, and re-enabling it does not retroactively grant one to an owner who registered while it was off. An enabled trial must never become a selectable checkout plan.

**Why:** Existing owners should retain promised access, while letting anyone select the free plan again would bypass the one-time trial limit.

**How to apply:** Persist a non-active subscription for owners who arrive while grants are off, and keep the free plan separate from the paid-plan catalog and checkout even when its grant toggle is on.

Removing obsolete plans from the catalog is different from deleting historic billing evidence. Old plans with no references may be deleted once; those referenced by an owner subscription, checkout quote, or payment must be archived and hidden from selection instead.

**Why:** A clean administrator list must not erase the terms or identity needed to interpret an older customer's subscription and payment.

**How to apply:** Keep current purchasable and grantable catalogs free of legacy plans while retaining referenced records for entitlement lookup and audit history. Do not re-seed the removed plans at startup.

Superadmin-granted full free access is an independent entitlement, never a replacement for the owner's paid subscription. Granting it permanently stops paid auto-renewal; expiration must not restart charging automatically.

**Why:** The user explicitly chose to stop paid renewal and not resume it automatically for owners given exceptional free access, while preserving paid subscription and payment history.

**How to apply:** Resolve grants across owner aliases, evaluate their own expiry for access, keep the prior billing record intact, block new charges while a grant is active, and require a separate explicit action before any paid renewal resumes.

Account-level discounts cover both the base subscription and add-ons, but apply once to the total of each *new* quote, not retroactively to captured payments or each line separately. Keep them separate from full free access and do not combine them with promotional codes.

**Why:** The user specifically chose both subscription and add-on charges for the custom discount. Applying a fixed discount separately per line would unintentionally multiply its value; repricing an already-dispatched payment would break its approved quote.

**How to apply:** Snapshot the effective discount when creating checkout and renewal invoices; use inclusive Saudi-calendar bounds for dated grants, keep historical invoices and payments unchanged, and clearly disclose that existing quoted requests retain their quoted price.