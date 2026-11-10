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
