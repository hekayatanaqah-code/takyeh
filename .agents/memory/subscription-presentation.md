---
name: Subscription presentation and platform contact
description: Subscription support uses Takyah’s official configured contact; UI refinements must preserve agreed billing.
---
Subscription-related support is branded «تكيّة» and uses the platform's configured official WhatsApp destination, not an owner's contact or an invented fallback number.

**Why:** The user reported another platform's name and a wrong contact destination in subscription support.

**How to apply:** Read the public platform contact settings, normalize phone digits for the WhatsApp URL, and keep the prefilled message specific to Takyah subscriptions. If no valid destination is available, explain that instead of silently routing to a placeholder.

Presentation changes to subscription dialogs must not change prices, consent, wallet behavior or historical recurring/one-time terms.

**Why:** The requested fixes concern centering, clearer explanations and Arabic number/currency presentation, not new billing rules.

**How to apply:** Format display numbers only. Preserve machine payment values and quote snapshots. Explain that historic one-time add-ons are not charged again but still require an active base subscription.

Moyasar form methods must be configured explicitly; do not hide the gateway's entire error container to suppress Apple Pay setup errors.

**Why:** The external Moyasar form SDK defaults to Apple Pay, card and STC Pay. Its Apple Pay configuration validation can replace the entire form with technical diagnostics when merchant validation is not configured, even though card networks were supplied.

**How to apply:** Treat payment methods and card networks as separate SDK options. Offer only configured methods, preserve card-only recurring consent, and show understandable Arabic failures without suppressing payment validation or implying success.

Owners may explicitly clear a saved pending card-subscription reference and select a new plan without waiting for automatic server confirmation.

**Why:** The user requested a visible manual escape from the pending-subscription notice. Clearing a browser reference is not cancellation of a bank payment or a refund.

**How to apply:** Require explicit acknowledgement of possible duplicate payment, clear only the matching local card-checkout reference and stale return state, and leave existing subscriptions, payment records and uncertain wallet operations untouched. Do not unblock a fresh checkout if local removal fails.
