---
name: Financial report calendar
description: Saved financial calendar preference, temporary switching, explicit locale calendars and service period boundaries.
---
The platform's authoritative initial calendar is now Hijri, including financial reports, month lists and annual views. Legacy saved Gregorian display preferences must not override it. A local calendar switch remains temporary. Exports use the currently displayed calendar, period and activity, and dates show the corresponding other calendar.

**Why:** The user's platform-wide calendar unification request supersedes the earlier choice of independent default report calendars. Temporary exploration of the other calendar remains separate from the authoritative default.

**How to apply:** Start in Hijri even with legacy Gregorian preferences, and share the active calendar across filters, custom-range grouping, print, PDF and sharing. Do not reinterpret stored ISO dates or change contractual payroll cycles merely to change date presentation.

Always specify the calendar when formatting Gregorian Arabic dates; an Arabic Saudi locale can default to Umm al-Qura even when the underlying Date was constructed from a Gregorian month.

**Why:** Locale-only formatting can label a Gregorian month/year as Hijri and mislabel secondary dates with a Gregorian era suffix.

**How to apply:** Use explicit gregory or islamic-umalqura in chart labels and report templates. For combined property/service reports, filter both sources by actual boundaries of the chosen calendar month; never present a Gregorian service total under a Hijri month label.

Financial reports use year-first selection, followed by only that year's nonempty financial months, newest first. Do not retain an empty current month or year as an exception in this section.

**Why:** The user explicitly asked to hide empty financial periods, including the previously retained current period, and avoid long mixed-year lists.

**How to apply:** Scope financial periods to the selected property, service or unified activity. Exclude cancelled, zero-value and future records, include owner-wide property expenses, and reconcile an unavailable selection to the latest real period. This report-specific rule does not change other sections' current-month exceptions.

Financial report print/PDF output uses the literal abbreviation «ر.س» in one nonwrapping, directionally isolated block beside its amount, with the footer «منصة تكيّة — تقرير مالي».

**Why:** The user explicitly requested this currency presentation and a unified platform-only footer for financial reports.

**How to apply:** Keep these report-specific choices separate from the platform's general riyal artwork convention. Zero page margins and empty page-margin boxes suppress native browser furniture where supported; never promise to override every browser's user-controlled header/footer setting.

The financial reports section has its own activity filter, initially the current dashboard activity. With exactly one available activity, fix the report to that activity and display its name without a dropdown or «جميع الأنشطة». With multiple activities, retain «جميع الأنشطة» as an explicit local choice. Selecting a property or service scopes its report and updates both the screen and PDF heading to «التقرير المالي - [اسم النشاط]».

**Why:** The user explicitly requested current-activity defaults and matching report titles, then clarified that switching and «جميع الأنشطة» should only be available for multiple activities.

**How to apply:** Do not change the global dashboard activity to implement this filter. Keep published property IDs distinct from submission IDs, filter service totals by provider, and reset report-local export/share state when changing activity.

Completed quick sales belong in the selected activity's unified report revenue and explicit transaction details, on screen and in print/PDF; cancelled sales do not. Include periods whose only revenue comes from quick sales, even when new quick-sale entry is disabled.

**Why:** The user reported quick sales being omitted from comprehensive reports and their printed/PDF output.

**How to apply:** Keep sales distinct from booking collections and insurance, then sum them once in halalas. Apply the same activity and calendar boundaries to both sources, and stop exports if either source cannot load.

Service-report improvements must preserve property-report accounting and presentation. In service reports, show booking revenue and quick-sale revenue separately alongside their unified total, deposits and insurance; put all detail tables below the summary cards, consistent with print/PDF.

**Why:** The user explicitly restricted these improvements to service reports and required full stability for property reports.

**How to apply:** Reuse the current dashboard activity as the local report default without changing global selection. Do not count deposits or insurance as extra revenue; wait for both booking and sale reads rather than displaying missing data as zero.

Service reports support bookings-only, quick-sales-only and combined revenue scopes. Expenses remain the selected service's full recorded expenses for the same period, and final income is selected revenue minus those expenses, including negative results and expense-only periods.

**Why:** The user requested source filtering and service expense/net-income reporting. Expenses have no booking-versus-sale attribution, so allocating or duplicating them by revenue source would invent accounting data.

**How to apply:** Explain the full-period expense deduction in the page and PDF. Exclude unallocated owner-wide and property expenses rather than assigning them to every service. Apply identical source, service and calendar boundaries to summary cards, transaction tables and print/PDF, with closing totals after details.

Financial month dropdown options show a smaller, muted «يوافق:» subtitle listing the overlapping months of the other calendar, including their years and era labels.

**Why:** The user requested bidirectional calendar correspondence under each month name, whether Hijri or Gregorian is primary.

**How to apply:** Apply this to property, service and all-activity report selectors. Calculate correspondence from the entire selected month and year, not today's date or a midpoint; a Gregorian month can touch three Hijri months. Keep the collapsed selector compact with only its primary month name.

Property reports default to summaries and closing accounts with detailed booking/expense tables hidden. The compact report must fit one complete A4 page with readable notes and dates. A report-local checkbox controls the same detail visibility on screen, print and PDF, without changing calculations or service reports.

**Why:** The user requested concise property reports by default, optional long tables for financial review, and then explicitly required a one-page compact print/PDF with larger, higher-contrast secondary text.

**How to apply:** Keep closing revenue, expenses and net income visible for monthly, annual and custom reports in either state. Invalidate cached exports when visibility changes; sharing and archived PDFs must use the same choice. Long detailed exports may use multiple pages at readable size; never clip them or shrink all their pages into one tiny image.

Property closing accounts must explain beside revenue that collected income is not the total contractual booking value; unpaid/deferred balances explain differences. The explanation must also appear in print/PDF without changing accounting.

**Why:** The user explicitly requested this clarification to prevent owners interpreting different totals as an error.

**How to apply:** Describe the existing recognized collections and damage deductions accurately, distinguish refundable insurance, and retain the same wording on screen and in exports.

Service reports apply payment status to service principal only, using the same selected requests for summaries, details and exports. Completed quick sales are fully collected, so unpaid-only reports exclude them. Refundable insurance affects neither collections, outstanding principal nor net profit.

**Why:** The user requested complete financial parity with property reports without mixing insurance into receivables or showing totals from a different request scope.

**How to apply:** Keep full-period service expenses explicit rather than inventing allocations by payment status. Offer a service-local compact default and detailed mode consistently across page, printing, PDF and sharing; neither changes the property report's controls. Translate generated status/category codes into Arabic and use Arabic or numeric dates, preserving owner-authored identities and historical accounting data.

Service reports must offer the same monthly, annual and custom period choices as property reports, with readable, grouped source/payment/detail controls. A custom range includes both endpoints, regardless of the calendar used to select them.

**Why:** The user explicitly requested period parity for services while preserving the property reports and improving small explanatory text.

**How to apply:** Keep bookings, quick sales, full-period expenses and exported period headings on the identical selected period. Annual Hijri scopes follow the Hijri year, not its overlapping Gregorian year; incomplete or reversed ranges must not issue a report.
