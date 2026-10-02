---
name: Dependency audit coverage
description: Why both the workspace dependency scanner and pnpm audit matter for lockfile remediation
---

Run both the workspace dependency scanner and `pnpm audit` after dependency updates. Treat a high-severity finding from either as unresolved even if the other reports zero.

**Why:** The scanners' advisory feeds can differ for the same pnpm lockfile; one scan reported high-severity transitive packages after `pnpm audit` had already reached zero.

**How to apply:** For future security maintenance, compare package versions and dependency paths across both outputs, then verify the final lockfile against both scanners.