---
name: Property stay completion
description: Owner-requested timing boundaries for property insurance, booking-linked reviews and completed-booking archives.
---

Property insurance settlement and booking-linked reviews depend on the actual departure time for the booked period and duration, including overnight stays. Insurance receipt may be recorded before arrival, but refunds and damage deductions must wait until check-out. Booking-linked review invitations must not be sent, opened or submitted before completion; old links must recheck a rescheduled booking.

**Why:** The user explicitly requested these financial and review timing restrictions.

**How to apply:** Use Saudi time regardless of the server or visitor timezone. Insurance and review restrictions must be enforced by the server as well as the interface. Retain insurance and review actions in the completed archive; archiving does not waive the actual-departure restrictions.

Departure eligibility must remain tied to the booking's captured departure, not mutable property settings. Only an actual date, duration or period change adopts the current property schedule; no-op saves, restoration and financial edits retain the historical departure.

**Why:** Changing property hours must not reopen or close insurance/review eligibility on existing bookings. Historical schedules before the first capture cannot be reconstructed reliably.

**How to apply:** Use the persisted departure across server, browser and customer-history queries. Legacy bookings are initially captured from available schedules; missing schedules use the final occupied day's end. Later null legacy records never consult live schedules, and malformed dates remain locked until deliberately corrected.

The active booking list and completed archive use the end of the last occupied Saudi calendar day, independently of scheduled departure hours. Count the start date as the first occupied day; retain a multi-day booking through its last day in full and archive it only at the following midnight.

**Why:** The user's later clarification explicitly requires yesterday's single-day bookings to leave today's active list and multi-day bookings to remain until their final day has fully elapsed. When explicitly asked to choose between departure and calendar-end archiving, the user reconfirmed «نهاية آخر يوم محجوز». This supersedes the earlier shared list/archive/check-out boundary.

**How to apply:** Use the same whole-day rule on the list, archive API and exports, with automatic day rollover. Archiving is classification only, never deletion, and must not alter the separate insurance/review timing rules.

If no usable departure schedule exists, use the end of the last occupied Saudi calendar day rather than midnight at the start of that day. Honor existing general arrival/departure settings when period-specific settings are absent.

**Why:** Legacy records can lack period schedules; guessing an earlier departure could permit settlement while the guest is still staying.

**How to apply:** Keep this conservative fallback consistent across server and browser. Unlinked general review invitations retain their existing behavior because they have no booking from which to establish a departure.

Archive exports include every record matching the chosen archive tab and filters, not just the displayed page. Rescheduling exports describe the recorded change; they must not present today's booking price or balance as a historical financial snapshot.

**Why:** The owner requested external financial archiving, but rescheduling history does not establish what the booking's finances were at the time of each change.

**How to apply:** Keep the distinction explicit when expanding export columns or joining change logs to current bookings. Archive time filters refer to stay-start dates (the new start date for rescheduled records), not the time the cancellation or edit was recorded.

Property insurance management must show the booking number and complete Saudi check-out date/time above each card. Decisions remain locked when check-out cannot be established; confirmation dialogs must obey the same restriction as card buttons.

**Why:** The owner requested explicit operational linkage and a decision lock until check-out, not merely a hidden early-refund button.

**How to apply:** Use the server-calculated departure instant and recheck the current booking on save. This is timed stay completion, not a newly introduced manual check-out event.

Omit “بتوقيت السعودية” and equivalent timezone suffixes from insurance checkout displays and PDF/Excel headings. Keep the actual time calculations in Saudi time, with a clear Arabic 12-hour display. Keep insurance report headers concise, without repeated titles, “تقرير رسمي”, or descriptions of default all-period/all-status filters.

**Why:** The owner explicitly requested these final presentation changes, not a change to the governing timezone or settlement rules.

**How to apply:** Preserve report identity, owner details, actual date bounds, issue date, record count, and any genuinely active filters.

Insurance audit exports cover every matching record across pages and distinguish required, actually received, held, deducted and registered returned amounts, with deduction reasons and documentation status.

**Why:** The owner requested Excel/PDF insurance statements for accounting review. An insurance fee is a receivable, not proof that money was received or remains held.

**How to apply:** Only received, unsettled insurance contributes to held cash. Show receipt status separately, retain documented settlement amounts even for legacy records whose receipt is unrecorded, and never equate a settlement record with initiating a bank transfer.
