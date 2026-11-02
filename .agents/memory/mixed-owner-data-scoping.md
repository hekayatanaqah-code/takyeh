---
name: Mixed-owner data scoping
description: Prevents chalet and service records from leaking across tabs for owners who operate both product types.
---

Any dashboard tab opened for a selected service must use provider-linked data and authorization; do not mount a chalet-only component merely because its visual layout is reusable.

**Why:** Mixed owners can otherwise see or operate on chalet records while believing they are managing an individual service, which is a product-scope integrity failure even when owner authorization is valid.

**How to apply:** Reuse presentation patterns, but give service tabs provider-scoped endpoints and query keys. Include both service-only and mixed-owner scenarios when testing.

## Service booking message names

قوالب تأكيد وإلغاء وتعديل حجز الخدمات تعرض «اسم الخدمة» فقط في النص الافتراضي والمتغيرات، لا «اسم العقار».

**Why:** المستخدم طلب هذا التخصيص حصرياً للخدمات. إعدادات الرسائل الحالية مشتركة على مستوى حساب المالك، لذلك حفظ متغير الخدمة مباشرةً قد يكسر الاستبدال في رسائل العقارات بالحساب المختلط.

**How to apply:** حوّل متغير الاسم المحجوز عند عرض الخدمة والاستعادة وبعد الحفظ، مع إعادة تمثيله المتوافق في التخزين المشترك. لا تستبدل كلمات المالك أو قوالبه الإضافية، ولا تجعل تعديل أسماء المتغيرات يغيّر بقية نصوص العقارات.

## Provider dashboard: general versus individual services

«الطلبات والتقديمات» قسم عام لجميع خدمات مقدم الخدمة، وليس تبويبًا لخدمة واحدة. اختيار خدمة مستقلة يحدد بياناتها وإعداداتها فقط، دون تداخل مع الخدمات الأخرى.

**Why:** The user explicitly distinguished account-wide requests from the independent services managed by the same provider.

**How to apply:** Keep general controls separate from service-switching tabs. Preserve the selected service when returning from a general section, and isolate each service's forms and dialogs as well as its queries.

## Unified revenue includes service-only owners

«جميع الأنشطة» must include service bookings even when an owner has no properties. A single activity name in the selector must not be treated as proof that the underlying finance scope is already a specific service.

**Why:** Real service bookings were visible in the calendar but revenue showed zero because the all-activity financial view counted only property bookings. Its service summary also used Gregorian periods under Hijri filters.

**How to apply:** Include services in all-activity totals, available financial periods and visible booking details. Share selected-calendar boundaries across both product types. Reuse booking-cache freshness after writes, and never silently turn a failed service read into a valid zero total.