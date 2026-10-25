---
name: Negative currency accounting format
description: How negative SAR amounts (e.g. net profit/loss) are displayed so the loss is visually obvious.
---

Financial reports use an explicit leading minus before Eastern Arabic digits, not accounting parentheses. Keep the minus and digits directionally isolated, including screen, print and PDF. The report booking table scrolls on screen only; exported/printed reports retain every row.

**Why:** The user explicitly replaced the financial-report parentheses convention with a leading minus and asked to limit long on-screen booking tables.

**How to apply:** Treat this as a report-specific override of the older convention below. Do not change unrelated financial sections merely to match reports. Use lining numerals and consistent baseline glyphs for amounts and their separators.

`Intl.NumberFormat("ar-SA", { currencySign: "accounting" })` does NOT reliably wrap negative
values in parentheses for the `ar-SA` locale — it silently falls back to a plain minus sign
(tested: only generic `"ar"` locale honors `currencySign: "accounting"`, `"ar-SA"` does not).
Relying on it would have kept the exact bug being fixed (barely-visible minus sign).

**Why:** browser/locale ICU data for `currencySign: "accounting"` is inconsistent across
locale variants, so it can't be trusted for a user-facing fix.

**How to apply:** build accounting-style negative formatting manually instead:
```js
function formatAmountSigned(n) {
  const formatted = formatAmount(Math.abs(n));
  return n < 0 ? `(${formatted})` : formatted;
}
```
Pair the parentheses with an explicit red text class (not just an icon/border color swap —
easy to fix the icon color and forget the actual value `<p>`/`<td>` text color, which is the
part users actually read). Apply consistently across every place the same negative-capable
value is rendered: stat cards, tables, PDF export HTML, and WhatsApp/email share text.
