---
name: Archive report export decisions
description: Readable PDF column grouping and Excel calculation-metadata verification.
---

Keep wide archive PDF tables readable by splitting related column groups across pages, repeating booking number and customer identity. Do not fit a dense page by shrinking all its text.

**Why:** The owner explicitly requested larger report text and clearer column arrangement. An archive contains too many identifying and monetary columns to print them all legibly at the same width on A4.

**How to apply:** Preserve every original column across the report, repeat branding and page numbering, and calculate financial totals over all filtered records rather than the visible page. Keep insurance separate from rental collections and do not add the deposit to collections a second time.

Validate Excel calculation settings in the exported workbook XML rather than relying solely on an ExcelJS load/write round trip.

**Why:** ExcelJS writes the full-recalculation flag but does not restore that flag into its model when loading the workbook. A missing flag after reloading is not evidence that the exported file lacks it.

**How to apply:** Check SUM formulas and cached results through ExcelJS, and inspect the workbook XML when testing calculation metadata.
