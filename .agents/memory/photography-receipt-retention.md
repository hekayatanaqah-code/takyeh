---
name: Photography receipt retention
description: Approval and archive boundaries for cleaning abandoned photography receipt uploads.
---

Do not delete real receipt files before showing a dry-run report and obtaining explicit approval of its retention period. A proposed seven-day preview is not an approved retention policy.

**Why:** The user explicitly required review and retention approval before any real deletion.

**How to apply:** Keep maintenance manual and limited to the exact reviewed upload records. Never add eager source deletion, an automatic scheduled cleanup, or approval during setup.

Every saved transfer protects its receipt, including after related bookings are cancelled or refunded. Legacy files outside the independent receipt-upload registry are intentionally excluded, not presumed abandoned.

**Why:** Financial archive access must outlive the booking lifecycle, and the application's shared upload namespace contains unrelated assets.

**How to apply:** Check saved transfers directly, without booking-status filters, serialize attachment with cleanup, and require separately authorized reconciliation before expanding cleanup to legacy uploads.

Dedicated private namespaces must be explicitly excluded from generic object serving; a private ACL alone does not establish authorization across the application's serving routes.

**Why:** The generic authenticated object route does not enforce object ACLs, so retaining source and prepared financial files requires blocking that alternate route.

**How to apply:** Test both decoded and encoded source/prepared paths with an unrelated authenticated account, alongside authorized receipt-ID preview and download.
