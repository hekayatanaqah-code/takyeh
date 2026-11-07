import { Router } from "express";
import { db } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { insertRecords, updateRecords } from "@workspace/db/mutations";
import { supportRequestsQueryTable as tickets } from "@workspace/db/runtime-models";
import { z } from "zod";
import { getPhotographer } from "../lib/photographer-auth";

const router = Router();
router.get("/", async (req, res) => {
  const photographer = await getPhotographer(req);
  if (!photographer) return res.status(401).json({ error: "سجل الدخول أولاً" });
  const requests = await db.select({
    id: tickets.id, subject: tickets.subject, message: tickets.message, status: tickets.status,
    admin_reply: tickets.adminReply, admin_reply_at: tickets.adminReplyAt,
    admin_attachment_urls: tickets.adminAttachmentUrls, legacyAttachment: tickets.adminAttachmentUrl,
    is_read_by_owner: tickets.isReadByOwner, created_at: tickets.createdAt,
  }).from(tickets).where(eq(tickets.ownerId, `photographer_${photographer.id}`))
    .orderBy(desc(tickets.createdAt)).limit(300);
  return res.json(requests.map(({ legacyAttachment, ...ticket }) => ({
    ...ticket, admin_attachment_urls: ticket.admin_attachment_urls?.length ? ticket.admin_attachment_urls
      : legacyAttachment !== null ? [legacyAttachment] : [],
  })));
});
router.post("/", async (req, res) => {
  const photographer = await getPhotographer(req);
  if (!photographer) return res.status(401).json({ error: "سجل الدخول أولاً" });
  const body = z.object({ subject: z.string().trim().min(1).max(200), message: z.string().trim().min(1).max(10000) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "اكتب موضوع الطلب ونص الرسالة" });
  const [ticket] = await insertRecords(db, tickets, {
    ownerId: `photographer_${photographer.id}`, ownerName: `مصور: ${photographer.name}`,
    subject: body.data.subject, message: body.data.message, status: "new", source: "photographer",
  }, { returning: { id: tickets.id } });
  return res.status(201).json({ ok: true, id: ticket?.id });
});
router.post("/:id/mark-read", async (req, res) => {
  const photographer = await getPhotographer(req);
  if (!photographer) return res.status(401).json({ error: "سجل الدخول أولاً" });
  if (!/^[1-9]\d*$/.test(String(req.params.id))) return res.status(400).json({ error: "معرّف غير صحيح" });
  const result = await updateRecords(db, tickets, { isReadByOwner: true },
    and(eq(tickets.id, Number(req.params.id)), eq(tickets.ownerId, `photographer_${photographer.id}`)), { id: tickets.id });
  return result.length ? res.json({ ok: true }) : res.status(404).json({ error: "الطلب غير موجود" });
});
export default router;
