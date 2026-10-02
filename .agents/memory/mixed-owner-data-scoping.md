---
name: Mixed-owner data scoping
description: Prevents chalet and service records from leaking across tabs for owners who operate both product types.
---

Any dashboard tab opened for a selected service must use provider-linked data and authorization; do not mount a chalet-only component merely because its visual layout is reusable.

**Why:** Mixed owners can otherwise see or operate on chalet records while believing they are managing an individual service, which is a product-scope integrity failure even when owner authorization is valid.

**How to apply:** Reuse presentation patterns, but give service tabs provider-scoped endpoints and query keys. Include both service-only and mixed-owner scenarios when testing.

## Provider dashboard: general versus individual services

«الطلبات والتقديمات» قسم عام لجميع خدمات مقدم الخدمة، وليس تبويبًا لخدمة واحدة. اختيار خدمة مستقلة يحدد بياناتها وإعداداتها فقط، دون تداخل مع الخدمات الأخرى.

**Why:** The user explicitly distinguished account-wide requests from the independent services managed by the same provider.

**How to apply:** Keep general controls separate from service-switching tabs. Preserve the selected service when returning from a general section, and isolate each service's forms and dialogs as well as its queries.