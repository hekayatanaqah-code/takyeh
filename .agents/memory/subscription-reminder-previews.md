---
name: Subscription reminder previews
description: Safety boundary for super-admin tests of owner expiry warnings and reminder logs.
---

Test reminders should overlay only the owner dashboard subscription header for a limited period. They must not change the real subscription row or affect entitlement checks, checkout, or renewal terms. Label test notifications and WhatsApp drafts plainly as simulations.

**Why:** Moving a paid owner's real expiry date to test a warning could block legitimate access, alter renewal terms, or mislead the owner. A simulated warning exercises the display and log without that billing risk.

**How to apply:** Keep preview metadata separate from actual subscription state; expire its effect automatically and provide a manual stop. Preserve test log history with a visible test marker, but do not report a test WhatsApp draft as sent.