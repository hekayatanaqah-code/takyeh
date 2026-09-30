---
name: Broadcast channel consent
description: How to handle owner communication preferences and honest delivery reporting in platform broadcasts.
---

Platform broadcasts allow each owner to select multiple independent channels. In-app messages are enabled by default; external marketing channels require explicit opt-in, and a queued external delivery must check current consent again immediately before sending. A transport that is not configured must never be represented as delivered.

**Why:** Broadcasts may wait in a durable queue while an owner changes preferences; a consent snapshot from campaign creation is not sufficient to authorize a later external message.

**How to apply:** Any new broadcast channel or worker must honor the owner's current preference and report queued, failed, and delivered states separately. WhatsApp also requires the existing verified marketing opt-in and a usable business transport, not a manual chat link.

When editing a saved SMTP destination, never reuse its stored password to verify a changed host, port, or username. Require a new password first.

**Why:** A privileged session that cannot read a redacted SMTP password could otherwise redirect authentication to a server it controls and recover the credential.

**How to apply:** Treat any authentication destination change as credential rotation, and verify only against public TLS-protected SMTP endpoints.