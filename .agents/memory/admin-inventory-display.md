---
name: Administrative inventory display
description: Property pricing scope and owner identity labels in the main administration lists.
---

Do not offer a pricing-method filter or sort, or infer a pricing-method label, in the main property administration list. Service pricing controls remain independent.

**Why:** The user explicitly asked to remove the property pricing filter “لعدم وجوده في تفاصيل العقار”. Inferring a method from stored prices adds an administrative attribute the user does not recognize.

**How to apply:** Disable pricing behavior as well as its controls for properties, so a hidden or stale selection cannot exclude rows. Do not remove the property's actual booking prices.

Show the owner's account name alongside the property or service business name. Do not substitute the business name for a missing personal owner name or guess identity from contact details.

**Why:** The user requires the owner or provider name beside each record to make administrative follow-up easier.

**How to apply:** Use the durable ownership links described in [Owner account identity links](owner-account-identity-links.md). An unresolved identity must be visibly marked as unregistered rather than attributed to another account.