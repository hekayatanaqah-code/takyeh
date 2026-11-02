---
name: Connection recovery boundaries
description: Preserve open forms and avoid replaying financial or authentication actions during network recovery
---
Network recovery must preserve the mounted page and form inputs. Never reload an already mounted application or automatically replay a save, payment or authentication action.

**Why:** A transport error does not prove that the server rejected a write. Retrying an ambiguous payment or save can duplicate it, and a full page refresh would discard unsaved work.

**How to apply:** Automatic retries are limited to idempotent data reads; GET authentication endpoints such as logout are actions, not reads. Respect cancellation and navigation changes. Refresh failed empty queries rather than replacing populated form data. Only pre-application boot recovery may reload, because no form has mounted yet.

Customer-note autosaves must not activate the foreground loading overlay. Keep transport monitoring and explicit error/retry behavior intact.

**Why:** Browser verification showed that a slow note save made the whole app inert, preventing the owner from continuing to type while the save was in flight.

**How to apply:** Exempt only the customer-note autosave from foreground loading accounting, not from connection-error handling. Retain normal loading behavior for all other requests.

Edit-service forms must hydrate once per request identity, after the saved region's cities are available. Subsequent catalog/submission refetches and user region changes must not rehydrate the form.

**Why:** Reinitializing from changing query dependencies caused an infinite update loop with an unloaded city catalog and could overwrite unsaved edits when the region changed.

**How to apply:** Use stable empty query fallbacks, a per-request initialization guard, and load dependent location data before the initial form fill. Do not remove necessary effect dependencies to suppress the loop.

In browser network tests, context offline mode does not by itself fail Playwright-intercepted requests that are fulfilled by the test.

**Why:** Route fulfillment bypasses the browser's normal network transport; an apparently offline test can still return successful synthetic reads and health checks.

**How to apply:** Combine real browser offline/online transitions with explicit transport failures or unavailable health responses in the synthetic network. Require a successful reachability probe before asserting recovery. Keep all writes intercepted so duplicate-attempt assertions cannot cause real saves or charges.
