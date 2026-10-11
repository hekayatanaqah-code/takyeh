import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { getPhotographer } from "../lib/photographer-auth";

const router = Router();
router.get("/", async (req, res) => {
  const photographer = await getPhotographer(req);
  if (!photographer) return res.status(401).json({ error: "سجل الدخول أولاً" });
  const requests = await db.execute(sql`SELECT id, subject, message, status, admin_reply, admin_reply_at,
    CASE WHEN array_length(admin_attachment_urls, 1) > 0 THEN admin_attachment_urls
      WHEN admin_attachment_url IS NOT NULL THEN ARRAY[admin_attachment_url] ELSE '{}'::text[] END AS admin_attachment_urls,
    is_read_by_owner, created_at FROM owner_support_requests
    WHERE owner_id = ${`photographer_${photographer.id}`} ORDER BY created_at DESC LIMIT 300`);
  return res.json(requests.rows);
});
router.post("/", async (req, res) => {
  const photographer = await getPhotographer(req);
  if (!photographer) return res.status(401).json({ error: "سجل الدخول أولاً" });
  const body = z.object({ subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(10000) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "اكتب موضوع الطلب ونص الرسالة" });
  const result = await db.execute(sql`INSERT INTO owner_support_requests
    (owner_id, owner_name, subject, message, status, source, created_at)
    VALUES (${`photographer_${photographer.id}`}, ${`مصور: ${photographer.name}`}, ${body.data.subject}, ${body.data.message}, 'new', 'photographer', now()) RETURNING id`);
  return res.status(201).json({ ok: true, id: result.rows[0]?.id });
});
router.post("/:id/mark-read", async (req, res) => {
  const photographer = await getPhotographer(req);
  if (!photographer) return res.status(401).json({ error: "سجل الدخول أولاً" });
  if (!/^[1-9]\d*$/.test(String(req.params.id))) return res.status(400).json({ error: "معرّف غير صحيح" });
  const result = await db.execute(sql`UPDATE owner_support_requests SET is_read_by_owner = true
    WHERE id = ${Number(req.params.id)} AND owner_id = ${`photographer_${photographer.id}`} RETURNING id`);
  return result.rows.length ? res.json({ ok: true }) : res.status(404).json({ error: "الطلب غير موجود" });
});
export default router;
