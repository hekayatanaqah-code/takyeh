---
name: Clean launch and private backups
description: User intent for an empty prelaunch database and reliable, private backup safeguards.
---

## Intentional empty initialization

The user requested a full prelaunch reset, including accounts, sessions, settings, catalogs and financial data, while preserving the database structure. Empty catalogs and subscription plans are intentional until the user requests real operational setup; do not silently restore demo/default records as a bug fix.

**Why:** The requirement was that every application table remain empty, not merely that tagged browser-test fixtures disappear.

**How to apply:** Check emptiness after restarting and loading the public site, not just immediately after deletion. Background-job heartbeats also count as database writes. Suppress empty-initialization bookkeeping without preventing normal subscription processing once real subscriptions exist. This records initialization intent, not permission for another deletion.

## Selective general-settings recovery

The user subsequently authorized restoring general system settings, official contact details and the administrator profile from backup, while keeping bookings, orders and financial transactions empty. This is not permission to restore the whole database or old owner/staff accounts.

**Why:** The operational data was deliberately erased, and a new working principal account/password was established separately afterward. Rolling its credentials or sessions back would undo that secure setup.

**How to apply:** Restore only general configuration and its directly referenced branding/help files. Merge the original principal's non-credential profile into the current administrator while preserving its current identity, password and active superadmin access. Exclude stale task heartbeats, simulated reminders and old initialization markers. Validate after restarting: public contact settings match the backup, the current administrator still works, and operational/financial tables remain empty. A newly initialized, closed master-catalog card is not a restored customer transaction.

## Recovery privacy and environment boundaries

Recovery archives containing account/session/financial data must remain private and outside both public-asset and private-upload serving prefixes. Keep secret environment values separate; do not put database archives in the public Library or a web-server-readable workspace path.

**Why:** Ignoring a file in Git/deployment does not itself prevent a development server from serving it. A local database reset also does not clear production or cancel/refund payments at the provider.

**How to apply:** Independently verify the target development database, stop application writers, and verify a complete code/database/upload archive before deleting active records. Confirm the remote backup by downloading it and matching its checksum. Describe environment and external-payment limits explicitly.

## Backup-client reliability

Do not assume libpq tools interpret a connection URI supplied through PGDATABASE like node-postgres interprets DATABASE_URL. Supply native connection settings internally without putting credentials in command-line arguments or logs.

**Why:** The clients parse environment defaults differently even when their PostgreSQL versions match.

**How to apply:** Verify the CLI against the application's actual database before relying on its backup. Keep tar output outside its input directory: changes to the input directory's timestamp can produce a “file changed” failure even when the output filename is excluded. Do not bypass nonzero archive-tool exits.
