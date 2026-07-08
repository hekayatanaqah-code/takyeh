---
name: Arabic percent sign ordering
description: Correct placement of the Arabic percent sign (٪) relative to digits in RTL Arabic UI text, and why the wrong order visually breaks parentheses/bidi rendering.
---

The Arabic percent sign (٪, U+066A) must be placed AFTER the number in JSX/text, e.g. `{pct.toLocaleString("ar-SA")}٪`, never before it (`٪{pct}`).

**Why:** Placing ٪ before the digits (`٪40`) conflicts with the Unicode Bidi Algorithm when the sequence is wrapped in ASCII parentheses (e.g. `(٪40)`) inside an RTL context. The digits are a weak-LTR run and the parens auto-mirror for RTL flow; combining that with a leading ٪ produces visually broken/reversed-looking parentheses. Putting the number first and ٪ last avoids the conflict and matches how Arabic percentages are conventionally written (number then symbol, e.g. "١٧٪").

**How to apply:**
- Always format as `{value.toLocaleString("ar-SA")}٪` (Arabic-Indic digits, symbol last) to match the app's existing `formatAmount()` currency convention (which already renders Arabic-Indic digits via `Intl.NumberFormat("ar-SA", ...)`).
- When the percentage is wrapped in ASCII parentheses or mixed with other bidi-neutral punctuation, add `dir="rtl"` on the wrapping span/element to isolate the bidi run and keep ordering stable regardless of surrounding context.
- Do not confuse this with CSS inline style percentages (e.g. `style={{ width: `${pct}%` }}`) — those use the ASCII `%` and are not display text, so they should NOT be changed to ٪.
