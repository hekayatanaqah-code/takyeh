---
name: Archive report export decisions
description: Single-row archive PDF reports, range navigation, and Excel calculation-metadata verification.
---

Keep each booking's identity and financial information together in one compact horizontal table row. Never split its columns into separate financial/identity tables or across pages, and never stack labelled amounts vertically inside cells.

**Why:** The owner explicitly rejected both column-group pagination and the tall cells that limited reports to about two bookings per page. They requested compact single-line rows with multiple bookings per page.

**How to apply:** Keep amounts/statuses in horizontal columns with compact preferred-calendar dates in the body; range/issue metadata retains both calendars. Break pages only between complete rows and allow necessary wrapping for unusually long names without truncating data. Use wider landscape paper rather than shrinking text excessively. Keep branch headings as plain text without badges/frames. Insurance stays separate from rental collections; the deposit is not added to collections a second time.

In custom archive ranges, the end-date picker opens on the start date's month/year in the active calendar, including when an end date was already selected. Opening a range picker must not silently choose a date.

**Why:** The owner requested faster historical range selection rather than resetting navigation to today's month.

**How to apply:** Preserve the stored end date until a day is explicitly chosen, and retain inclusive minimum/maximum bounds in both calendars.

Custom archive and financial-report date pickers must allow only today and earlier dates.

**Why:** The owner explicitly requested that future dates be excluded from these historical reporting controls.

**How to apply:** Apply the upper bound in both calendar systems and validate restored/filter values as well as disabled calendar days. Do not apply this restriction to operational booking calendars.

Arabic PDF text must not use nonzero letter spacing. Prefer whole-text browser shaping over per-glyph canvas drawing.

**Why:** The canvas renderer paints individually spaced glyphs separately, breaking Arabic connections. This was especially visible in the rightmost report-header text. Verify actual PDF raster output, not only the source HTML.

**How to apply:** Keep report typography isolated from inherited styles and avoid relying on remote web-font loading. Keep all-period wording as “جميع الفترات (حتى تاريخه)” and omit timezone wording from the issue label while retaining Saudi date calculations.

Rasterize a self-contained report at its own local origin, not a cloned RTL dashboard document.

**Why:** The dashboard's viewport/scroll offsets cropped most columns when the report was wider than the browser, even though PDF generation succeeded and the resulting image was not blank. Merely overriding capture coordinates did not resolve the cloned-document offset.

**How to apply:** Isolate page styles/images from the live dashboard. Verify raster content at both horizontal ends on desktop and phone-width viewports; page count, byte size and a nonblank-image check alone are insufficient.

Validate Excel calculation settings in the exported workbook XML rather than relying solely on an ExcelJS load/write round trip.

**Why:** ExcelJS writes the full-recalculation flag but does not restore that flag into its model when loading the workbook. A missing flag after reloading is not evidence that the exported file lacks it.

**How to apply:** Check SUM formulas and cached results through ExcelJS, and inspect the workbook XML when testing calculation metadata.
