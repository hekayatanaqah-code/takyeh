---
name: Photographer contract boundaries
description: Administrative legal text, historical consent and bank-transfer reconciliation scope
---
Do not generate or seed a real photographer joining/service agreement. The administrator supplies the actual terms; an unpublished contract must not be replaced by placeholder legal text to make registration work.

**Why:** The feature manages agreement text, not the drafting or approval of platform legal obligations. Silently supplying invented terms would change the user's intended administrative control.

**How to apply:** Keep tests explicitly temporary and remove their unreferenced contract versions. Preserve a photographer's accepted terms when the current contract changes; never rewrite historical consent or infer consent for pre-existing accounts.

Photographer transfer records reconcile bank payments made outside the platform; recording a transfer is not authorization to execute one.

**Why:** The requested financial cards require truthful transferred totals, but the staged launch does not authorize moving money or changing the existing Moyasar merchant.

**How to apply:** Distinguish earned entitlements, recorded transfers and remaining dues. Keep actual payments, WhatsApp sends and service activation outside routine UI verification.
