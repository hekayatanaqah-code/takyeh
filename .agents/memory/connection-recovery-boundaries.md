---
name: Connection recovery boundaries
description: Preserve open forms and avoid replaying financial or authentication actions during network recovery
---
Network recovery must preserve the mounted page and form inputs. Never reload an already mounted application or automatically replay a save, payment or authentication action.

**Why:** A transport error does not prove that the server rejected a write. Retrying an ambiguous payment or save can duplicate it, and a full page refresh would discard unsaved work.

**How to apply:** Automatic retries are limited to idempotent data reads; GET authentication endpoints such as logout are actions, not reads. Respect cancellation and navigation changes. Refresh failed empty queries rather than replacing populated form data. Only pre-application boot recovery may reload, because no form has mounted yet.
