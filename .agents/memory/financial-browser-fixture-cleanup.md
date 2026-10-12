---
name: Financial browser fixture cleanup
description: Preserve explicit fixture provenance so interrupted financial browser checks can be cleaned safely.
---

Do not assume that cancelling a browser helper, or queuing a cleanup follow-up, removes its temporary financial records and private objects.

**Why:** An interrupted financial browser check left synthetic accounts, wallet entries, refunds and a private receipt behind. Cleanup follow-ups did not finish; the main agent had to identify and remove the fixtures directly.

**How to apply:** Before browser verification begins, record only synthetic fixture identifiers and owned object references in an ignored, workspace-local manifest accessible to the main agent. Never include passwords, cookies or credentials. On interruption, stop the test browser, assert exact fixture identities, remove owned private objects before deleting their database references, and clean linked rows transactionally. Never identify deletions solely by a generic test name or creation time. Verify that the photography launch flag remains off.
