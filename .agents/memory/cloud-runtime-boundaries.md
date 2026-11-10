---
name: Cloud runtime boundaries
description: User-requested switch from Hostinger-specific startup to generic Node.js on Render.
---

Use provider-neutral Node.js startup for the repository root and Render deployments.
Do not make the root entry depend on exported Hostinger ZIPs or vendor-specific
configuration checks.

**Why:** The user explicitly requested removal of Hostinger requirements from
server.cjs, standard cloud operation on Render, and automatic GitHub updates for
that change.

**How to apply:** Build runtime outputs from tracked source, use the hosting PORT,
and keep service readiness distinct from frontend availability. Moving hosts does
not authorize a database conversion, seeding, deletion or financial repair.
The user subsequently explicitly approved using the existing PostgreSQL database
for Render, without converting or reseeding data. Private persistent-file
boundaries remain applicable. Hostinger-specific export tools may remain for
existing manual transfers but must not become a dependency of the cloud entry.

**Why:** The preview uses PostgreSQL; selecting MariaDB solely because the build
targets Render required an unrelated database the user did not intend to provision.

**How to apply:** Keep Render on the PostgreSQL driver, query and lock implementations
as a coherent set. MariaDB remains the separate explicit Hostinger export target.

Approval to retain PostgreSQL is not approval to expose the sandbox database or
silently provision a paid replacement.

**Why:** The current development connection resolves privately; Replit's official
documentation says that development endpoint is sandbox-only. Copying that URL
to Render cannot provide connectivity.

**How to apply:** Confirm external reachability before transferring credentials.
An externally reachable PostgreSQL copy requires an approved migration and cost
decision; preserve the existing data and do not create ad-hoc public DB tunnels.

Application build assets must live in tracked application directories, not depend
on the workspace's uploaded-file directory.

**Why:** A global Git ignore excludes `attached_assets/*`; local builds can succeed
with uploaded images that are absent from GitHub and fail on a clean cloud build.

**How to apply:** Preserve the original artwork, move required build images into
application assets, and verify builds from tracked files without attached_assets.

Derive application module identifiers relative to the configured application root,
never by splitting an absolute filename on `/src/`.

**Why:** Render's checkout parent is also named `src`. Splitting at the first
occurrence misidentifies route recovery entries and aborts the production build
even though the UI components themselves resolve successfully.

**How to apply:** Include a checkout path containing a parent `src` directory in
route-build regression tests; distinguish fatal recovery errors from source-map warnings.
