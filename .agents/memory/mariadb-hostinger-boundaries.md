---
name: MariaDB and Hostinger migration boundaries
description: User-selected target, export scope, and non-obvious compatibility constraints for the Hostinger migration.
---

## Target and data scope

The user specified **MariaDB 10.11** on **Hostinger Business Web Hosting**.
The authorized seed scope is **settings and the administrator account only**,
not owners, bookings, orders, quick sales, financial transactions or sessions.

**Why:** These were the user's explicit answers when asked which engine and
data should be transported. Do not infer permission to copy all operational data.

**How to apply:** Keep data exports limited to the agreed configuration and
current principal account; protect files containing password hashes and contact
settings from public serving, Git and deployment.

## Destination file storage

The user chose **local storage on Hostinger** for images and attachments.

**Why:** The user explicitly selected this option instead of independent cloud storage.

**How to apply:** Use a private persistent directory outside the web root and
release directory. Preserve public/private access boundaries and include that
directory in operator backups; do not keep Replit sidecar authentication in the
Hostinger runtime.

## SQL export is not application compatibility

Successful schema/seed import does not establish that PostgreSQL routes or
transaction/advisory-lock semantics work on MariaDB. Keep the existing source
database intact until the ported runtime passes its critical-flow tests.

**Why:** The application historically relied on PostgreSQL-specific mutation
results, upserts, raw JSON/array expressions and advisory locks. Porting one
category does not establish compatibility of the others.
Replacing only the driver can silently undermine booking and financial safety.

**How to apply:** Require native query and locking implementations with actual
MariaDB verification before switching the application connection or publishing.
GET_LOCK is not automatically equivalent to a PostgreSQL transaction lock.

## Lock protocol cutover

Stop all writers using the old advisory-lock protocol before activating writers
using transaction row locks against the same database. Do not do a rolling
cutover that leaves both locking protocols active.

**Why:** Lock identities in different database primitives do not synchronize,
even when each implementation is safe in isolation.

**How to apply:** Pause old workers, schedulers and web writers; provision the
new technical mutex reference table on the destination; activate and verify
the new writers together. Never delete/reseed mutex rows during active work.

## Express startup failures

Treat the Express 5 listen callback as error-aware, not success-only. Do not
start background jobs unless binding actually succeeded.

**Why:** A port-conflict test kept the failed process alive because Express 5
also invoked its callback with the listen error and initialization started timers.

**How to apply:** Test that an occupied port produces a clean nonzero exit,
not merely an error log, whenever changing server bootstrap or shutdown logic.

## Native Hostinger listener with full application functionality

Keep the native HTTP listener independent of database/schema initialization and
retain the existing backend handlers for all platform functions. The user chose
full functionality after being warned that a static-only replacement would remove
login, bookings and payments.

**Why:** The user requested immediate port binding to avoid startup-related 503s,
but explicitly approved preserving the complete application rather than replacing
it with a static site.

**How to apply:** Bind the hosting-provided port first (3000 only as the requested
fallback when absent), serve the public SPA directly, then initialize schema and
attach backend handlers to the same listener. Do not restore blocking database
setup to the npm start/build command. Frontend availability is not proof of backend
readiness; preserve separate liveness/readiness checks and explicit API failures.

## Upload archive versus private transfer archive

For hPanel Node.js uploads, deliver an application-only archive with package.json
and the entry file at its root, separate from any private migration archive.
Never upload the settings/admin seed or private media exports as application code.

**Why:** A complete migration archive has a nested app directory and sensitive
siblings; it is not interchangeable with the archive Hostinger detects as a
Node.js project. A generic Hostinger HTML 503 does not prove a PORT defect.

**How to apply:** Check the extracted ZIP itself, its root, selected server preset,
entry file and Node version. Obtain Hostinger Runtime Logs before naming the live
startup failure; Replit logs and successful local tests cannot establish its cause.

## Native tooling limitations

Drizzle Kit's MySQL introspection can crash on MariaDB check-constraint metadata;
do not remove or weaken database checks just to make introspection succeed.
Also set utf8mb4 on the **import connection**, not only the database.

**Why:** MariaDB 10.11 check introspection produced an undefined checkConstraint
error; an import connection using older UTF-8 rejected emoji default values
even though the destination database itself used utf8mb4.

**How to apply:** Use a reviewed source-catalog conversion and validate the
result on the target engine. Preserve checks, partial uniqueness and foreign keys.

## Private export serving

Git/deployment ignores and a Vite deny pattern matching only dotfiles do not
guarantee that files inside hidden directories cannot be served by `/@fs/`.

**Why:** A live preview request returned a private export from a hidden directory
until directory-descendant deny rules were added.

**How to apply:** Verify the actual response body, not just the HTTP status.
Protect export/backup directory descendants in every preview server and never
treat a hidden workspace directory as a security boundary by itself.

## Local MariaDB test provisioning

The sandbox process tracer may interrupt MariaDB system-table installation
with a `/proc/.../fd/-1` error even when the database engine itself can run.
Do not report that as a MariaDB schema or Hostinger compatibility failure.

**Why:** This environment-specific bootstrap failure recurred during native
schema and transaction verification. Socket-only throwaway tests could still
exercise InnoDB, but did not validate authentication or production privileges.

**How to apply:** Keep any grant-disabled workaround strictly local,
socket-only and temporary. Never use it in the application configuration or on
Hostinger, and distinguish engine/transaction tests from access-control tests.

## Do not replay legacy startup repairs

Migration startup must not replay the legacy application's automatic seed/repair
routine. The user subsequently requested automatic schema-only setup during
Hostinger build/start; this is allowed, but must not replay account/settings seeds
or financial-history repairs.

**Why:** The legacy startup routine is not just reference-catalog initialization:
it also backfills cancelled-booking insurance as refunded and rewrites message
templates. Replaying that routine during the move could change financial history
or owner wording without a reviewed data migration.

**How to apply:** Keep destination schema and configuration changes reviewed and
separate. Automatic setup may create missing tables, constraints and technical
lock rows without deleting existing data. Preserve the full runtime mutex range,
even when asked to ensure only a smaller subset exists. Treat historical insurance
and template transformations as separate, authorized migrations.
