---
name: Browser test database evidence
description: Resolving contradictory persistence observations during browser tests
---
Do not treat a tester's tool-backed SQL observation alone as proof that an API mutation failed to persist. Verify the same record through the application's actual database connection and capture the mutation response first.

**Why:** A photography approval test reported an approved UI badge but a pending tool-backed SQL result. A focused reproduction using the real API and direct application database reads consistently showed the approved state; the original mutation response had not been captured, so the earlier contradiction was not reliable evidence of a persistence bug.

**How to apply:** For a reported mismatch, collect the mutation URL and record ID, HTTP status/body, subsequent API read, and a direct read through the runtime database connection. Establish these facts before changing persistence logic or inferring that two tools share the same current state.

Development schema changes also need confirmation through the application's actual database connection. A successful tool-backed ALTER can affect a different database and leave runtime queries failing for missing columns.

**Why:** Adding photographer profile fields succeeded through the database tool, but the app's integration tests still reported missing columns and the application's own information-schema query returned none of the additions.

**How to apply:** Verify reviewed additive changes through the runtime connection before restarting or testing. If databases differ, apply only the scoped development DDL through the app connection; never infer that the tool's successful result changed runtime storage.
