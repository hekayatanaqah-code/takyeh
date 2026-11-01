# Owner dashboard modules

## Scope and ownership

This is a structural extraction, not a redesign or a loading optimization. The
original declaration bodies were preserved; no API contract, permission,
authentication flow, database or major dependency changed.

- `src/pages/Dashboard.tsx` remains the composition root: identity, employee and
  administrator-preview modes, URL handling, activity selection, permission
  gates, loading/error/empty states, and the selected tab.
- `src/components/owner/OwnerDashboardContexts.tsx` owns the single shared
  instances of the read-only, selected-service and financial-activity contexts.
  Their providers stay in the composition root. Owner sections never import the
  page or reach into its local state.
- Property and service sections have separate modules: calendars, registration,
  details, insurance, seasons and contracts. Existing props and context hooks
  retain their original inputs and behavior.
- Account sections such as profile, notifications, messaging, support, customers,
  staff and reviews own their existing local state.
- Financial sections and report/receipt export helpers are separate from the
  page. Shared formatting, calendar, API and booking declarations are small
  explicit dependencies, not a barrel that imports the page.
- Component declarations stay at module scope. Do not introduce components
  inside render functions: their changing identities can remount controlled
  fields and lose focus.

The eight formerly named-exported sections now live in their corresponding
owner modules; the page keeps its default `Dashboard` export. No existing
consumer imported the old named exports.

## Measurements

Measured in the same workspace using the same production build command:

```sh
PORT=5173 BASE_PATH=/ pnpm --filter @workspace/chalet-marketplace run build
```

| Measure | Before | After extraction |
| --- | ---: | ---: |
| Dashboard source, UTF-8 bytes | 1,653,050 | 94,581 |
| Dashboard lines | 29,077 | 1,639 |
| Extracted owner modules | — | 43 |
| Largest extracted module, UTF-8 bytes | — | 254,063 |
| Vite build phase | 14.16 s | 14.30 s |
| Main JavaScript chunk | 4,192.09 kB | 4,192.09 kB |
| Main chunk gzip | 1,124.58 kB | 1,128.48 kB |

The final removal of an obsolete line-number comment makes the page one line
and 75 bytes smaller than the measured extraction (final: 1,638 lines and
94,506 bytes).

The dashboard source shrank by about **94.3%**. A syntax-tree comparison found
all **185** original top-level declarations unchanged apart from export
modifiers. No extracted module reaches Babel's 500 KB source threshold.

One before/after build is not a performance benchmark: build duration did not
improve, the uncompressed main chunk is unchanged, and gzip increased slightly.
There is no claim of faster startup or rendering. Imports remain eager to avoid
introducing new loading boundaries. The pre-existing production chunk-size
warning remains. Development logs no longer report Dashboard's Babel warning;
the independent large `Admin.tsx` warning remains outside this work.

## Verification

- Workspace typecheck: `pnpm run typecheck` — passed.
- E2E typecheck: `pnpm --filter @workspace/chalet-marketplace run typecheck:e2e`
  — passed.
- Production frontend build — passed.
- `test:owner-navigation` — 19 passed, including module size, cycles, stable
  component definitions, singleton contexts, empty states, all inventory
  combinations and selection recovery.
- `test:e2e:owner-empty` — 27 passed in Chromium against the running frontend:
  all account types; entry/reload and account-action routes; delayed/failed
  inventory; first service registration; property/service drafts; service-only
  and mixed activities; successive keystrokes without losing focus; employee
  permissions; administrator preview.
- Broad frontend unit run — 304 of 305 passed. The unrelated existing
  `customerHistoryTabs.test.ts` assertion expects `سجل الحجوزات` for a service,
  while the current service tab is `الحجوزات والمبيعات`. Its test, component and
  tab helper are unchanged by this extraction. This is not hidden or repaired
  by changing product behavior here.

The browser fixture intercepts all API calls and rejects unknown requests.
These checks created no real accounts, bookings, uploads or payment activity.
Source-based financial/calendar regressions now target the extracted modules;
their assertions were retained.

The public homepage preview renders correctly. The unauthenticated dashboard
screenshot redirects into an externally blocked sign-in page; its development
URL returns HTTP 200, and the signed-in synthetic browser suite above verified
the dashboard itself.
