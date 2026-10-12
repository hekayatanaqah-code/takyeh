import { Router } from "express";
import { db, photographyBookingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getPhotographer } from "../lib/photographer-auth";
import { getOwnerIds } from "./owner";
import { receiptStorage } from "../lib/photography-receipts";
import { requestSessionFile, sessionUploadSchema } from "../lib/photography-session-files";

const router = Router();
router.param("id", (_req, res, next, value) => {
  if (!/^[1-9]\d*$/.test(value) || Number(value) > 2147483647) return res.status(400).json({ error: "معرّف جلسة غير صحيح" });
  return next();
});
router.param("index", (_req, res, next, value) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(400).json({ error: "معرّف ملف غير صحيح" });
  return next();
});
router.post("/portal/bookings/:id/uploads/request", async (req, res) => {
  const p = await getPhotographer(req);
  if (!p) return res.status(401).json({ error: "سجل دخول المصور أولاً" });
  const parsed = sessionUploadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "اختر ملف صورة أو PDF أو ZIP أو فيديو لا يتجاوز ١٠٠ ميجابايت" });
  const [b] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, Number(req.params.id)));
  if (!b || b.photographerId !== p.id || b.assignmentStatus !== "assigned" || !["confirmed","completed"].includes(b.status)
    || +b.endAt > Date.now() || (b.deliveredAt && (b.deliveryUrl || b.deliveryFiles.length))) return res.status(409).json({ error: "رفع التسليم متاح للجلسة المسندة المنتهية وغير المسلمة فقط" });
  return res.json(await requestSessionFile(b.id, p.id, parsed.data));
});
router.get("/bookings/:id/files/:index", async (req, res) => {
  const p = await getPhotographer(req);
  const ownerIds = req.isAuthenticated() ? await getOwnerIds(req) : [];
  if (!p && !ownerIds.length) return res.status(401).json({ error: "سجّل الدخول لمراجعة ملفات الجلسة" });
  const [b] = await db.select().from(photographyBookingsTable).where(eq(photographyBookingsTable.id, Number(req.params.id)));
  if (!b || (!ownerIds.includes(b.ownerId) && p?.id !== b.photographerId)) return res.status(403).json({ error: "ملفات الجلسة خاصة بالمالك والمصور المسند" });
  const index = Number(req.params.index);
  const f = Number.isSafeInteger(index) && index >= 0 ? b.deliveryFiles[index] : undefined;
  if (!f) return res.status(404).json({ error: "ملف التسليم غير موجود" });
  const file = await receiptStorage.getObjectEntityFile(f.objectPath);
  const inline = req.query.download !== "1" && ["application/pdf","image/jpeg","image/png","image/webp"].includes(f.contentType);
  res.setHeader("Content-Type", f.contentType);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.name)}`);
  return file.createReadStream().on("error", () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); }).pipe(res);
});
export default router;
