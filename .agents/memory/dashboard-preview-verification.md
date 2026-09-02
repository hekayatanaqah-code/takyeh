---
name: Dashboard preview verification
description: Verification fallback when the authenticated dashboard route is blocked by the preview proxy.
---

An authenticated dashboard route can be blocked by the external preview proxy even while the Vite app and API are healthy.

**Why:** The dashboard preview returned an external 403 block page, while the development domain returned the app successfully and API requests continued returning successful responses.

**How to apply:** Distinguish proxy blocking from an application failure by checking workflow readiness, the development-domain HTTP response, and browser/API logs; do not change app routing solely because of the proxy page.