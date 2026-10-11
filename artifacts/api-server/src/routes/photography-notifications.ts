import { Router } from "express";
import { db, photographyDeliveriesTable, photographyBookingsTable } from "@workspace/db";
import { and, eq, sql, desc, isNull, or, inArray } from "drizzle-orm";
import { getPhotographer } from "../lib/photographer-auth";
import { subscribePhotographyBookings } from "../lib/photography-events";

export async function photographerNotifications(photographerId: number) {
  return db.select({
    id: photographyDeliveriesTable.id, bookingId: photographyBookingsTable.id,
    propertyName: photographyBookingsTable.propertyName, packageName: photographyBookingsTable.packageName,
    startAt: photographyBookingsTable.startAt, endAt: photographyBookingsTable.endAt,
    createdAt: photographyDeliveriesTable.createdAt, readAt: photographyDeliveriesTable.internalReadAt,
    whatsappStatus: photographyDeliveriesTable.status,
  }).from(photographyDeliveriesTable).innerJoin(photographyBookingsTable, eq(photographyBookingsTable.id, photographyDeliveriesTable.bookingId))
    .where(and(eq(photographyBookingsTable.photographerId, photographerId),
      eq(photographyBookingsTable.assignmentStatus, "assigned"),
      inArray(photographyBookingsTable.status, ["confirmed", "completed"]),
      or(eq(photographyDeliveriesTable.photographerId, photographerId), isNull(photographyDeliveriesTable.photographerId)),
      sql`(${photographyDeliveriesTable.dedupeKey} = 'booking:' || ${photographyBookingsTable.id}::text || ':photographer'
        OR ${photographyDeliveriesTable.dedupeKey} = 'booking:' || ${photographyBookingsTable.id}::text || ':photographer:' || ${photographerId}::text)`))
    .orderBy(desc(photographyDeliveriesTable.createdAt)).limit(200);
}
const router = Router();
router.param("id", (_req, res, next, value) => {
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
    return res.status(400).json({ error: "معرّف غير صحيح" });
  }
  return next();
});
router.post("/notifications/:id/read", async (req, res) => {
  const photographer = await getPhotographer(req);
  if (!photographer) return res.status(401).json({ error: "سجل الدخول أولاً" });
  // Scope by the booking, including legacy delivery rows without photographer_id.
  const [notice] = await db.select({ id: photographyDeliveriesTable.id })
    .from(photographyDeliveriesTable).innerJoin(photographyBookingsTable, eq(photographyBookingsTable.id, photographyDeliveriesTable.bookingId))
    .where(and(eq(photographyDeliveriesTable.id, Number(req.params.id)),
      eq(photographyBookingsTable.photographerId, photographer.id),
      eq(photographyBookingsTable.assignmentStatus, "assigned"),
      or(eq(photographyDeliveriesTable.photographerId, photographer.id), isNull(photographyDeliveriesTable.photographerId)),
      sql`(${photographyDeliveriesTable.dedupeKey} = 'booking:' || ${photographyBookingsTable.id}::text || ':photographer'
        OR ${photographyDeliveriesTable.dedupeKey} = 'booking:' || ${photographyBookingsTable.id}::text || ':photographer:' || ${photographer.id}::text)`));
  if (!notice) return res.status(404).json({ error: "الإشعار غير موجود" });
  await db.update(photographyDeliveriesTable).set({ internalReadAt: new Date() })
    .where(and(eq(photographyDeliveriesTable.id, notice.id), isNull(photographyDeliveriesTable.internalReadAt)));
  return res.json({ ok: true });
});
router.get("/events", async (req, res) => {
  const photographer = await getPhotographer(req);
  if (!photographer) return res.status(401).json({ error: "سجل الدخول أولاً" });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write("retry: 3000\n: connected\n\n");
  const unsubscribe = subscribePhotographyBookings(photographer.id, res);
  const heartbeat = setInterval(async () => {
    try {
      const current = await getPhotographer(req);
      if (!current || current.id !== photographer.id) { res.end(); return; }
      res.write(": heartbeat\n\n");
    } catch { res.end(); }
  }, 25000);
  heartbeat.unref();
  const cleanup = () => { clearInterval(heartbeat); unsubscribe(); };
  req.on("close", cleanup);
  res.on("close", cleanup);
  return;
});
export default router;
