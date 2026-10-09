---
name: Owner registration feedback
description: Requested error visibility and explicit time-confirmation behavior in the owner registration form.
---

In «انضم إلينا كمالك», errors must be noticeable even when the owner is at the bottom of the page: smooth scroll to the top, a bottom-center floating notification, and a red offending field with the reason directly underneath.

**Why:** The user explicitly requested all three cues, including duplicate social-account errors.

**How to apply:** Cover local validation and server-side save failures, including edit mode. Keep this positioning scoped to registration notifications rather than moving unrelated application notifications.

Preserve the interactive time buttons. Selecting صباحاً/مساءً should immediately make time confirmation available, while saving still requires the explicit «تأكيد الوقت» action.

**Why:** The user requested faster confirmation activation without replacing the current button design.

**How to apply:** Do not replace the controls with long dropdowns or automatically save and close merely because a period button was selected.
