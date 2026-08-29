---
name: API test timer teardown
description: Explains why full-app API integration tests can pass yet keep the Node test process alive.
---

Importing the full API application also imports the admin routes, which start the long-pause alert interval as a module side effect. Integration tests that host the full app must clear that global interval during teardown.

**Why:** The test assertions and database cleanup can all finish successfully while Node remains alive indefinitely because the interval still owns an active event-loop handle.

**How to apply:** When adding full-app route tests, clear the pause-alert timer before closing the HTTP server and database pool. A future refactor may instead move background-job startup out of route-module imports.