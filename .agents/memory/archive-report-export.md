---
name: Archive report export decisions
description: Single-row archive PDF reports, range navigation, and Excel calculation-metadata verification.
---

Keep each booking's identity and financial information together in one horizontal table row. Never split its columns into separate financial/identity tables or across pages.

**Why:** The owner explicitly rejected column-group pagination and requested one complete row per booking on landscape pages.

**How to apply:** Related details can share one cell (collections/deposit, insurance status/due/received). Break pages only between complete rows. Use wider landscape paper for extra cancellation columns rather than splitting columns or shrinking text excessively. Repeat branding and page numbering, and calculate totals over all filtered records. Insurance stays separate from rental collections; the deposit is not added to collections a second time.

In custom archive ranges, the end-date picker opens on the start date's month/year in the active calendar, including when an end date was already selected. Opening a range picker must not silently choose a date.

**Why:** The owner requested faster historical range selection rather than resetting navigation to today's month.

**How to apply:** Preserve the stored end date until a day is explicitly chosen, and retain inclusive minimum/maximum bounds in both calendars.

Validate Excel calculation settings in the exported workbook XML rather than relying solely on an ExcelJS load/write round trip.

**Why:** ExcelJS writes the full-recalculation flag but does not restore that flag into its model when loading the workbook. A missing flag after reloading is not evidence that the exported file lacks it.

**How to apply:** Check SUM formulas and cached results through ExcelJS, and inspect the workbook XML when testing calculation metadata.
