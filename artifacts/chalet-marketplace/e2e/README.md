# Owner onboarding regression tests

Run from the repository root:

```sh
pnpm --filter @workspace/chalet-marketplace test:owner-navigation
pnpm --filter @workspace/chalet-marketplace test:e2e:owner-empty
```

The Playwright configuration starts Vite when `PLAYWRIGHT_BASE_URL` is absent.
To reuse an existing preview, set that variable to its origin. On Nix, an
installed Chromium can be selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/repl/tools/bin/chromium`.
Other runners use Playwright's pinned Chromium (install with
`pnpm --filter @workspace/chalet-marketplace exec playwright install chromium`).
The existing release-gate workflow runs this suite in the pinned Playwright image.

## Isolation and cleanup

Each test uses a fresh browser context and a unique `example.test` owner.
The fixture intercepts **all** API requests; only explicitly modelled reads,
three synthetic gallery uploads and service submission are
allowed. Unknown requests fail the test and are never forwarded to the server.
Third-party requests are blocked, including payment and WhatsApp traffic.

Owners, saved requests, published resources (with distinct registration and
resource IDs), login state and upload responses exist only in fixture memory.
Teardown releases delayed requests, clears that state and cookies, and Playwright
closes the context even if an assertion fails. No database rows, storage objects,
real sessions or credentials are created; no database cleanup query is needed.

The service save test exercises the actual form and navigation from an already
authenticated synthetic owner session with a stateful mock API, not login,
backend persistence or approval. It deliberately stops before any payment,
messaging or administrative write.
