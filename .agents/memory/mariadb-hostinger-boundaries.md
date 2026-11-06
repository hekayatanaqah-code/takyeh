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

## SQL export is not application compatibility

Successful schema/seed import does not establish that PostgreSQL routes or
transaction/advisory-lock semantics work on MariaDB. Keep the existing source
database intact until the ported runtime passes its critical-flow tests.

**Why:** The application relies on PostgreSQL-specific mutation results,
upserts, raw JSON/array expressions and transaction-scoped advisory locks.
Replacing only the driver can silently undermine booking and financial safety.

**How to apply:** Require native query and locking implementations with actual
MariaDB verification before switching the application connection or publishing.
GET_LOCK is not automatically equivalent to a PostgreSQL transaction lock.

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
