---
name: Component fixture bootstrap
description: Avoid false blank-page failures when testing real exported components in temporary isolated fixtures
---
For a temporary fixture that mounts real application components, use a TSX entry with normal bare React, React DOM and React Query imports. A public HTML bootstrap must initialize React Refresh before dynamically importing the entry.

**Why:** Public HTML fixtures may not receive Vite's usual HTML preamble injection. Guessing optimized dependency URLs, or deriving the React DOM version from React's URL, can produce missing-preamble errors, stale-optimizer HTTP 504s, undefined imports or split React Query contexts even when the actual application works.

**How to apply:** Let Vite resolve every dependency through the TSX entry instead of copying dependency hashes. Set up fetch interception before mounting the real component, keep all fixture data isolated, and delete the fixture and entry before delivery or publishing. Do not treat a fixture bootstrap failure as evidence of an application regression.
