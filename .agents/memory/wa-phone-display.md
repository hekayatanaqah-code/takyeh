---
name: WhatsApp phone display pattern
description: How the WA phone input in OwnerProfileTab converts between storage, display, and API formats.
---

## Rule
- **DB stores**: international format `9665XXXXXXXX` (Latin digits)
- **State stores**: whatever the user typed (may be Arabic or Latin)
- **Display** (`value` prop): `toArabicDigits(waUnifiedPhone)` → renders ٠-٩
- **On load**: strip `966` prefix → prepend `0` so user sees `05XXXXXXXX` in Arabic
- **On save**: `normalizeWaPhone(raw)` handles both Arabic-Indic (٠-٩) and Latin (0-9) input → always outputs `966...`

**Why:** Arabic-Indic numeral display (`٠-٩`) must match the رقم الجوال field above it in OwnerProfileTab. The backend only stores/accepts the international format.

**How to apply:** Any future phone input in this tab should follow the same three-layer pattern: load→localise, display→toArabicDigits, save→normalizeWaPhone. Do NOT store or send Arabic-Indic digits to the API.

## Explicit Eastern Arabic display
Use actual Eastern Arabic Unicode digits in phone input values and placeholders, not just font settings. Internal validation and API data may remain canonical Latin digits; native input patterns must match the displayed Arabic digits.

**Why:** The user repeatedly requested Arabic-number examples and then corrected the photographer invitation field because canonical Latin state was still being displayed directly. Font localisation alone does not satisfy the requested display.

**How to apply:** Keep ٠٥-style display separate from normalized phone data, including when users type or paste with a Latin keyboard. Preserve numeric filtering, length limits, and prefix validation.
