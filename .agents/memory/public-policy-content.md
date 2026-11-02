---
name: Public policy content authority
description: Privacy wording comes from the administrator's saved content and must update in an open preview.
---
The privacy policy must display the wording saved in the administration panel, not an independently authored or bundled frontend copy. Updates must reach an already-open preview, not only appear after navigation or rebuilding.

**Why:** The user repeatedly requested direct live Settings / Page Content API retrieval and immediate visibility of administrative edits.

**How to apply:** Treat the saved policy as the authoritative legal text. Do not rewrite it while fixing presentation or freshness. Editorial changes must not require a build or manual cache purge. Describe any refresh interval honestly rather than claiming instantaneous server-push updates.
