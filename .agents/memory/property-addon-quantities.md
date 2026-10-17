---
name: Property add-on quantities
description: Per-booking quantity limits and historical financial snapshots for property facilities
---
The property owner's «إدارة الخدمات والمرافق» controls property add-ons, not independent service providers or the owner's marketplace for ordering platform services. The quantity limit is per booking; it is not shared stock across a date or concurrent guests. An omitted limit is unlimited; zero means unavailable for ordering.

**Why:** The user requested «الكمية المتاحة لكل حجز» on the add/edit form to prevent orders beyond what the property can provide. A shared stock/reservation engine would introduce a different business rule.

**How to apply:** Enforce the cap in the booking UI and again against the active, property-scoped catalog on the server. Do not reduce one booking's allowance because another booking selected the same add-on.

Historical add-on booking prices are quoted line totals, including the selected quantity. Existing financial summaries, receipts and contracts sum these line totals directly.

**Why:** Existing bookings and report renderers predate quantity controls. Multiplying their stored prices again, or looking up today's catalog prices, would change historical totals.

**How to apply:** Preserve old one-unit bookings and denormalized booking snapshots when changing, disabling or deleting a catalog service. A quantity and unit-price snapshot may accompany the line total, but consumers must not multiply that total again.
