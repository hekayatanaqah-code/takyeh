---
name: WhatsApp Message Settings Patterns
description: Key decisions and patterns for OwnerMessageSettingsTab — template vars, live preview, upgrade logic, and dual-date system.
---

## Dual-date variable system
- `{التاريخ}` → Hijri date only (e.g. "٦ صفر ١٤٤٧") — NOT both dates combined
- `{التاريخ_م}` → Gregorian date only (e.g. "١ أغسطس ٢٠٢٥")
- `{من_التاريخ}` / `{من_التاريخ_م}` → start date Hijri / Gregorian
- `{إلى_التاريخ}` / `{إلى_التاريخ_م}` → end date Hijri / Gregorian
- Template pattern: `{التاريخ} هـ الموافق {التاريخ_م} م`

**Why:** Users need both calendars in the same WhatsApp message for clarity with Saudi customers.

## `{الفترة}` and `{الفترة_الجديدة}` in confirmation/cancellation context
- Both `{الفترة}` and `{الفترة_الجديدة}` resolve to `b.period` translated: morning→صباحية, evening→مسائية, full_day→يوم كامل
- In modification context (`openRescheduleLogWhatsApp`), `{الفترة_الجديدة}` uses a different path and means the new period after reschedule
- `buildCancellationWaMsg` and `openManualWhatsAppTemplate` both have the same replacement chain — update both when adding new variables

## Template upgrade-on-load pattern
`useEffect` in `OwnerMessageSettingsTab` detects stale templates using unique phrases:
- Confirmation: checks `includes("أمنياتنا لكم")`
- Cancellation: checks `includes("نراكم في أيام قادمة")`
- Modification: checks `includes("الحجز السابق: يوم")`

**Why:** API returns DB-saved values which override defaults. Spread `{...defaults, ...data}` means old DB templates always win. Upgrade check + unique sentinel phrase ensures existing users get new format without touching DB.

**How to apply:** When updating default templates, always choose a unique closing phrase that old templates won't have, and update the upgrade detection string accordingly.

## PREVIEW_SAMPLE_DATA must cover all MESSAGE_VARIABLES
`WhatsAppPreview` uses `PREVIEW_SAMPLE_DATA` to replace vars in the live bubble. Any variable used in any template that isn't in `PREVIEW_SAMPLE_DATA` will show as raw `{var}` in the preview. Keep both in sync.

## Custom templates in رسائل إضافية
Each custom template card includes: Textarea (rows=5, resize-none) + MESSAGE_VARIABLES tag buttons + `<WhatsAppPreview>`. The tag click handler appends the variable to `tpl.body` via `updateCustomTemplate`.
