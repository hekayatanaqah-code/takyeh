---
name: Service location catalog isolation
description: Why service-provider locations must remain separate from property locations.
---

Service regions and cities must use an independent catalog and independent administration surface from chalet/property locations. The service administration UI must not include districts.

**Why:** The user explicitly requires service-provider coverage to be controlled separately so enabling or disabling a service location never changes the property submission options.

**How to apply:** Any service registration, coverage, location validation, or service-location administration must use the service region/city catalog only. Do not reuse property location endpoints or tables, and do not add district controls to the service locations page.

New-city proposals belong to a private review queue, not the site's general settings. They remain pending until a permitted administrator approves or rejects them.

**Why:** The user requires an explicit city-review workflow; general settings are public-facing configuration and are not an appropriate place for requests carrying requester identity and review history.

**How to apply:** City approval changes only the service location catalog, with an active parent region and no duplicate city. It must not approve a provider's activity, start a subscription trial, or affect property locations. Preserve legacy proposals when moving them out of settings.