---
name: Owner-level payroll expenses
description: Owner-wide salary visibility and atomic confirmation boundaries.
---
Salary payments must automatically create a linked expense with the employee's name, actual net amount and actual payment date. Owner-wide salary expenses remain visible when a property or service is selected; this is visibility of a shared expense, not allocation of the full amount to every unit.

**Why:** The user reported confirmed salaries missing from Expenses. The existing expense creation was hidden by unit filters, because payroll is owner-wide rather than attached to an individual property.

**How to apply:** Keep the same scope rules in Expenses and the bank statement. Preserve provider isolation for provider-specific expenses. Count each owner-wide salary once in the consolidated view, and retain halalas.

Salary confirmation and its expense must commit together. Concurrent confirmation of one employee's same salary month must not generate repeated expenses or overwrite paid terms.

**Why:** Automatic creation introduces two financial records that must never diverge; retrying a confirmation must not duplicate a debit.

**How to apply:** Route every confirmation entry point through the same transactional payment operation. Use the actual Saudi payment date, not the payroll month, for the expense date. Do not recreate historical payroll expenses speculatively.
