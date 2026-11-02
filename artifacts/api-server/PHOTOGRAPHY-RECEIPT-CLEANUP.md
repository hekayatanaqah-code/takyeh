# Photography receipt cleanup

## Current safety boundary

Deletion is **off by default**. No scheduler, startup task, post-merge script or
upload-completion request deletes receipt files. Only the explicit maintenance
`execute` command can delete, after a stored dry-run report has been reviewed and
its exact retention period approved. Do not run approval or execution on real
files without the user's authorization.

New uploads are registered before signing/writing under these private paths:

- `/objects/photography-receipts/source/<upload UUID>`
- `/objects/photography-receipts/prepared/<same UUID>`

Cleanup reads the registry, never lists a bucket or scans `/uploads`. Legacy
receipts and unregistered objects are deliberately not candidates. Retain those
unless a separate inventory/reconciliation is explicitly authorized.

Both paths are retained for every saved transfer, without checking booking
status, refunds, photographer status, or transfer date. Receipt IDs and paths
are checked again immediately before deletion. Existing admin/photographer
receipt preview/download routes and their authorization remain unchanged.
Generic `/api/storage/objects/photography-receipts/...` access is always blocked
for both source and prepared copies, including for logged-in users. Only the
dedicated receipt-ID route can serve a saved receipt to an authorized viewer.

## Review and approval

From the workspace:

```sh
# Read-only storage inspection. 7 is a PROPOSAL, not an approved policy.
pnpm --filter @workspace/api-server exec tsx src/maintenance/photography-receipts.ts preview 7
```

The JSON result includes a run ID, retention days, and exact registered paths,
with `saved_transfer`, `retained`, `outside_scope`, `already_deleted`,
`invalid`, `expired_upload`, `unlinked_receipt`, or `retry_deletion` reasons.
It does not probe object existence or content, and "candidate" does not imply the
object actually exists. Invalid files are classified when completion validates
their bytes. Missing objects are handled idempotently only during approved cleanup.
Superadmins can also request a report using
`POST /api/admin/photography/receipt/cleanup-preview` with `{"retentionDays":7}`.

**Show this report to the user and obtain explicit approval of the retention
period and the listed deletions first.** Then an authorized operator can record
that approval, naming the accountable approver (no passwords or credentials):

```sh
pnpm --filter @workspace/api-server exec tsx src/maintenance/photography-receipts.ts approve RUN_ID 7 APPROVER --confirm-reviewed-report
pnpm --filter @workspace/api-server exec tsx src/maintenance/photography-receipts.ts execute RUN_ID --confirm-delete
```

An approval applies only to that saved report and its exact retention days.
Later uploads require a new report. Execute rechecks references, path scope,
age and upload expiry; newly saved transfers are skipped even if listed as
candidates in the approved report. There is no HTTP approval/deletion endpoint.

## Audit and recovery

`photography_receipt_cleanup_runs` stores immutable report/approval information
and appended intent/result/skip events. `photography_receipt_uploads` retains
metadata and a deletion tombstone; receipt metadata is not removed. The shared
PostgreSQL transaction lock serializes completion, receipt attachment and cleanup
intent. A committed `deleting` state rejects late completion or attachment before
storage deletion starts, including after a crash. A transfer that commits first
protects both paths indefinitely.

Failed deletion stays `deleting` with `delete_failed`; rerun the approved report
to retry exact paths. Missing objects count as already deleted; permission,
network and storage service errors do not. A crash after deleting bytes but before
recording success is safe to retry. No other financial data is changed.

## Verification

`pnpm --filter @workspace/api-server run test:receipt-cleanup` uses generated
database fixtures and a temporary local directory with a strict path allowlist.
It never signs real URLs or deletes App Storage files. The test cleans up its
own fixture metadata only.
