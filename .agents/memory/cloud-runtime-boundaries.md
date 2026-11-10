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
The MariaDB and private persistent-file boundaries remain applicable until the
user explicitly changes them. Hostinger-specific export tools may remain for
existing manual transfers but must not become a dependency of the cloud entry.

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
