---
name: Print CSS header protection
description: How to protect a colored header from a global @media print color override in contract pages.
---

## Rule
When a `@media print` block has a broad rule like `.contract-print-area p { color: #1a1209 !important }`, never rely on structural CSS selectors (e.g. `> div > div:first-child p`) to create exceptions for colored headers. Use a named class instead.

## Why
Structural selectors are fragile — one extra wrapper div breaks them silently. Also, two `!important` rules battle on specificity; a structural selector can lose if DOM depth doesn't match exactly.

## How to apply
1. Add `className="contract-header"` (or equivalent) to the header element in JSX.
2. In `@media print`, write the exception as:
   ```css
   .contract-header p {
     color: #ffffff !important;
     -webkit-print-color-adjust: exact !important;
     print-color-adjust: exact !important;
   }
   .contract-header {
     -webkit-print-color-adjust: exact !important;
     print-color-adjust: exact !important;
   }
   ```
3. `print-color-adjust: exact` is required — without it, browsers may strip background colors and colored text in PDF export mode.
