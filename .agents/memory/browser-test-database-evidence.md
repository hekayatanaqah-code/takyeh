---
name: Browser test database evidence
description: Resolving contradictory persistence observations during browser tests
---
Do not treat a tester's tool-backed SQL observation alone as proof that an API mutation failed to persist. Verify the same record through the application's actual database connection and capture the mutation response first.

**Why:** A photography approval test reported an approved UI badge but a pending tool-backed SQL result. A focused reproduction using the real API and direct application database reads consistently showed the approved state; the original mutation response had not been captured, so the earlier contradiction was not reliable evidence of a persistence bug.

**How to apply:** For a reported mismatch, collect the mutation URL and record ID, HTTP status/body, subsequent API read, and a direct read through the runtime database connection. Establish these facts before changing persistence logic or inferring that two tools share the same current state.
