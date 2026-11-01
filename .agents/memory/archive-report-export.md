---
name: Archive report export decisions
description: Single-row archive PDF reports, range navigation, and Excel calculation-metadata verification.
---

Keep each booking's identity and financial information together in one compact horizontal table row. Never split its columns into separate financial/identity tables or across pages, and never stack labelled amounts vertically inside cells.

**Why:** The owner explicitly rejected both column-group pagination and the tall cells that limited reports to about two bookings per page. They requested compact single-line rows with multiple bookings per page.

**How to apply:** Keep amounts/statuses in horizontal columns. The owner explicitly requested both dates inside the PDF stay column: Hijri first, with Gregorian below in smaller text, even when the account prefers Gregorian. This is a limited exception to compact single-line cells; other dates and range/issue metadata retain their calendar preference. Break pages only between complete rows and allow necessary wrapping for unusually long names without truncating data. Use wider landscape paper rather than shrinking text excessively. Keep branch headings as plain text without badges/frames. Insurance stays separate from rental collections; the deposit is not added to collections a second time.

Keep only one report-header count, “عدد السجلات المطابقة: X”; omit the redundant count of records on the current page without removing range/issue metadata.

**Why:** The owner requested final header cleanup and complete dual-calendar documentation within the stay column.

**How to apply:** The header count covers all exported matches and remains the same across PDF pages. Keep page numbering in the footer.

In custom archive ranges, the end-date picker opens on the start date's month/year in the active calendar, including when an end date was already selected. Opening a range picker must not silently choose a date.

**Why:** The owner requested faster historical range selection rather than resetting navigation to today's month.

**How to apply:** Preserve the stored end date until a day is explicitly chosen, and retain inclusive minimum/maximum bounds in both calendars.

Custom archive and financial-report date pickers must allow only today and earlier dates.

**Why:** The owner explicitly requested that future dates be excluded from these historical reporting controls.

**How to apply:** Apply the upper bound in both calendar systems and validate restored/filter values as well as disabled calendar days. Do not apply this restriction to operational booking calendars.

Arabic PDF text must not use nonzero letter spacing. Prefer whole-text browser shaping over per-glyph canvas drawing.

**Why:** The canvas renderer paints individually spaced glyphs separately, breaking Arabic connections. This was especially visible in the rightmost report-header text. Verify actual PDF raster output, not only the source HTML.

**How to apply:** Keep report typography isolated from inherited styles and avoid relying on remote web-font loading. Omit timezone wording from the issue label while retaining Saudi date calculations.

Archive quick filters follow the account's saved reports-calendar preference, falling back to the bookings preference. A local archive calendar switch does not change the saved account setting or operational booking calendar.

**Why:** The owner requested Hijri/Gregorian month and year filters linked to account settings. Accounts have separate booking/report preferences, so changing the operational calendar must not silently redefine a report filter.

**How to apply:** Resolve Hijri boundaries with Umm al-Qura and send Gregorian ISO bounds to the existing archive API. Refresh the account preference after saving settings; keep quick filters, year labels, date pickers and the temporary calendar switch consistent.

Archive period actions stay in a single horizontal RTL row in this order: all periods, this month, last month, choose year, choose month, custom range. The filtering-calendar selector places Hijri on the right and Gregorian on the left. Keep explanatory copy short, readable and high-contrast.

**Why:** The user explicitly requested this six-action order, a selected-month filter, and clean RTL formatting throughout the archive.

**How to apply:** Permit horizontal scrolling on narrow screens without hiding actions. Selected-month ranges must follow the chosen calendar and year, with identical results/export bounds. Preserve independent archive calendar switching, and do not reverse the option array in addition to RTL layout.

Export metadata must print the exact earliest/latest stay dates in the exported matches, including all-period and selected-year reports. Rescheduling uses the new stay date, not its old date or edit timestamp.

**Why:** The owner explicitly requested “الفترة من: … إلى: …” with both calendars instead of broad filter labels or whole-year boundaries.

**How to apply:** Derive the bounds from all exported records, not the currently displayed page, and retain the saved calendar first. Use “تحديد فترة” for the custom-range action.

Excel exports use separate calendar columns: native Gregorian date values and zero-padded Umm al-Qura year/month/day text for Hijri.

**Why:** The owner requested independent sorting/filtering for each calendar. Excel's built-in Hijri date rendering can use a different calendar from the platform's Umm al-Qura dates.

**How to apply:** Keep the two columns adjacent with the preferred calendar first, preserve worksheet RTL and numeric accounting values, and reindex formulas when inserting date columns.

Rasterize a self-contained report at its own local origin, not a cloned RTL dashboard document.

**Why:** The dashboard's viewport/scroll offsets cropped most columns when the report was wider than the browser, even though PDF generation succeeded and the resulting image was not blank. Merely overriding capture coordinates did not resolve the cloned-document offset.

**How to apply:** Isolate page styles/images from the live dashboard. Verify raster content at both horizontal ends on desktop and phone-width viewports; page count, byte size and a nonblank-image check alone are insufficient.

Validate Excel calculation settings in the exported workbook XML rather than relying solely on an ExcelJS load/write round trip.

**Why:** ExcelJS writes the full-recalculation flag but does not restore that flag into its model when loading the workbook. A missing flag after reloading is not evidence that the exported file lacks it.

**How to apply:** Check SUM formulas and cached results through ExcelJS, and inspect the workbook XML when testing calculation metadata.
