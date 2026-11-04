# Owner onboarding regression tests

## Stay completion and departure regression tests

```sh
pnpm --filter @workspace/chalet-marketplace test:e2e:stay-completion
```

The Chromium `stay-completion` project uses a controlled Playwright clock in
`America/Los_Angeles`, deliberately different from Saudi time. Its Vite-only
HTML entry mounts the real `BookingCalendarTab` used by `Dashboard.tsx` and its
nested `ManageInsuranceDialog` (now extracted into `PropertyBookingDialogs.tsx`).
No duplicated booking UI, test-only clock or production login bypass is used.
React Query notifications use microtasks so paused timers do not stall responses.

The owner's confirmed rule is **archive at the end of the final occupied Saudi
date**, not at check-out. Insurance settlement and booking-linked review
eligibility separately wait for the captured `checkoutAt`, including overnight
stays already in the archive. Tests cross exact midnight/departure boundaries
with the page/dialog open, keep multi-day stays active through their final day,
and simulate timer suspension followed by both focus and visibility restoration.
They assert no navigation/reload, both settlement choices, and review button
eligibility, without clicking a settlement confirmation or sending a review.

All records exist only in a new browser context and the per-test route fixture.
The raw bookings response never changes with the clock: the actual component
must filter it. Only the simulated archive API applies an independent explicit
midnight oracle; this is UI regression coverage, **not backend/API coverage**.
Unknown APIs, all writes, service workers, external traffic and popups are
blocked; optional Google fonts are blocked without being treated as failures.
Teardown clears cookies, closes the context and discards fixture records even
when assertions fail. No accounts, database rows, storage files, WhatsApp
messages or money are created/sent. The release-gate workflow runs this suite.

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

## Connection recovery regression tests

```sh
pnpm --filter @workspace/chalet-marketplace typecheck:e2e
pnpm --filter @workspace/chalet-marketplace test:e2e:connection
```

Both Chromium projects run the same six cases at desktop (1440×900) and
touch/mobile (390×844) sizes. This is viewport/touch coverage, not a claim of
Safari/WebKit coverage. The existing release-gate workflow runs both projects.

The Vite-only `e2e/fixtures/connection.html` entry mounts the **real AppStatus,
installed connection monitor and React Query** with a controlled synthetic form.
It loads the production status stylesheet and logo. It is not a production app
route or a production build entry. This suite tests the shared connection
behavior, not a specific business form, authentication or a real payment gateway.

Browser-context offline/online changes are combined with network-route failures:
Playwright-fulfilled routes can otherwise succeed even while the context is
offline. The strict fixture blocks unknown APIs and external traffic; only
synthetic reads, health probes and synthetic save/payment POSTs are handled.
Write failures model a received request whose response was lost. Assertions
cover the brand/message, full viewport overlay, inert background, unchanged
controlled values, no reload, restored focus and continued typing, reachability
before recovery, one read retry, cancellation both during slow reads and while
waiting offline, and no duplicate writes after a full probe interval.

No database rows, storage objects, real payment operations, user settings or
photography configuration are used. Teardown releases delayed handlers, resets
offline mode, clears cookies and closes the context, discarding all synthetic
form/query/mutation state even after failed assertions.
