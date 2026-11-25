---
name: Long-form video uploads
description: Why tutorial and guide videos must bypass the short-media processing endpoint.
---

Section guide and other long-form videos must upload directly to object storage using a presigned URL. Do not send them through the general processed-media upload route.

**Why:** The processed-media route intentionally re-encodes and truncates video to 30 seconds. That behavior is useful for short promotional clips but silently destroys long tutorial content.

**How to apply:** Use direct presigned uploads for any video whose full duration must be preserved, then store its object-serving URL. Reserve processed uploads for explicitly short clips.

Do not use a database or Replit storage percentage as evidence of free video
capacity on Render's separate persistent disk.

**Why:** Reproducing a failed MP4 upload confirmed an immediate Render filesystem
capacity rejection even though the user saw a low usage percentage elsewhere.
The file itself uploaded and passed a full byte-for-byte readback locally.

**How to apply:** Measure the actual media filesystem's available bytes and
required upload space before proposing deletion or a paid disk increase. Do not
weaken the free-space safeguard merely to make an upload appear successful.