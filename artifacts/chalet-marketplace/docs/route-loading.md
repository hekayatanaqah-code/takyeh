# Route loading and build comparison

The homepage stays eager. Other route pages use dynamic imports without changing
the existing route table, role checks, redirects, or page implementations.
The unused `ChaletMasterView` import was removed; no route referenced it.

## Production build comparison

Measured on 2026-11-02 using the same workspace and command before/after:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/chalet-marketplace run build
pnpm --filter @workspace/chalet-marketplace run typecheck
```

Vite reports decimal kB:

| JavaScript | Before | After |
| --- | ---: | ---: |
| Initial JavaScript, minified | 4,226.11 kB | 590.60 kB |
| Initial JavaScript, gzip | 1,137.73 kB | 192.94 kB |

Initial JavaScript shrank by approximately **86.0%** before compression and
**83.0%** after gzip. The after figure includes both the entry and its eager
shared dependency, not just the smaller entry file. The generated HTML preloads
that shared dependency but not the owner/admin pages or recovery bundles.

This is a transfer-size comparison, not a measured time-to-interactive claim.
Images, styles, API latency and connection speed still affect first opening.
Large dashboard/admin chunks still exist, but are downloaded for their routes,
not for the homepage. Splitting dashboard tabs is separate work.

## Failure recovery contract

- Each route has its own Suspense and download-error boundary.
- Waiting reuses the same branded screen as application connection/loading state.
- A failed import offers an explicit Arabic retry button; it never reloads the
  document, clears the query cache, or repeats an API mutation.
- Retry replaces the rejected lazy instance only for that route, including future
  visits to the recovered route.
- Browsers cache failed module graphs, and an error can identify a shared
  dependency instead of the route. Production retry uses a build-generated
  manifest to import the **intended page's** recovery bundle, which includes its
  static dependency graph. It never interprets a dependency's exports as a page.
- Recovery bundles keep the entire eager graph external, preserving the existing
  React, authentication and query-client instances. The manifest must match the
  current runtime's build; a stale tab cannot import another build's singletons.
- Required stylesheets are retried separately. Each explicit module retry uses a
  new query parameter, so a failed recovery bundle itself can be retried.
- These recovery copies add approximately 5.1 MB of generated output on disk,
  but **zero startup downloads**. They are requested only after a failed route
  download and an explicit retry. Generated output stays outside Git history.
- Page-render exceptions are not swallowed as download errors.
- The loaded component identity stays stable during normal updates. Existing
  network recovery keeps mounted forms intact. Ordinary navigation away from a
  page retains the application's existing unmount behavior; this is not a new
  cross-route draft persistence feature.

## Regression checks

```sh
pnpm --filter @workspace/chalet-marketplace run test:route-loading
pnpm --filter @workspace/chalet-marketplace run typecheck:e2e
# After building, with the existing web workflow running:
cd artifacts/chalet-marketplace
PLAYWRIGHT_BASE_URL=http://127.0.0.1:22125 \
  pnpm exec playwright test e2e/route-loading.spec.ts \
  --project=route-loading-desktop --project=route-loading-mobile --workers=1
```

Use the current workflow URL in `PLAYWRIGHT_BASE_URL`, not a fixed port. Tests
fulfill the built HTML/assets from `dist/public`, supply synthetic read/auth
responses, and block API writes. They never require production accounts/data.
Mounted-form network recovery has separate desktop/mobile coverage in
`e2e/connection-recovery.spec.ts`.
