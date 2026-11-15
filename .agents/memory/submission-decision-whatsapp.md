---
name: Submission decision WhatsApp
description: Owner-facing transactional WhatsApp notices for approval and revision decisions.
---

Property and service approval/publication and return-for-revision decisions should
notify the registered owner via the existing Taqnyat integration. Revision notices
include administrator notes. Normalize Arabic Saudi mobile digits before sending.

**Why:** The user requested automatic owner notices for these two decisions, with
an explicit requirement that WhatsApp failure must not prevent the database update.

**How to apply:** Send only after the decision transaction commits. Use the durable
owner identity for the recipient; never reuse the authentication template for
operational messages. Business-initiated notices require separately approved
utility templates; do not claim delivery is active without confirmed template
configuration. Preserve OTP behavior and do not treat gateway acceptance as
handset delivery.

Administrators must be able to edit the two submission-notice template names in
system settings without code changes or another deployment.

**Why:** The user explicitly requested self-service template-name configuration.

**How to apply:** Saved settings take precedence over environment defaults, are
read for each notice, and an explicitly saved blank disables that notice rather
than silently restoring an old environment value.
