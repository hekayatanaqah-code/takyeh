---
name: Negative currency accounting format
description: How negative SAR amounts (e.g. net profit/loss) are displayed so the loss is visually obvious.
---

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
