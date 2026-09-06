---
name: Long-form video uploads
description: Why tutorial and guide videos must bypass the short-media processing endpoint.
---

Section guide and other long-form videos must upload directly to object storage using a presigned URL. Do not send them through the general processed-media upload route.

**Why:** The processed-media route intentionally re-encodes and truncates video to 30 seconds. That behavior is useful for short promotional clips but silently destroys long tutorial content.

**How to apply:** Use direct presigned uploads for any video whose full duration must be preserved, then store its object-serving URL. Reserve processed uploads for explicitly short clips.