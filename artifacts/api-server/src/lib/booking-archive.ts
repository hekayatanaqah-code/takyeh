import type { Request, Response } from "express";
import { and, count, desc, eq, getTableColumns, gte, inArray, isNotNull, isNull, lte, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, chaletsTable, chaletSubmissionsTable, ownerBookingsTable, ownerRescheduleLogsTable } from "@workspace/db";
import { GetOwnerBookingArchiveQueryParams } from "@workspace/api-zod";
import { isStayComplete } from "@workspace/booking-time";

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(value => {
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "تاريخ غير صالح");

// Orval emits z.date() for date-only query parameters; HTTP query values are strings.
export const archiveQuerySchema = GetOwnerBookingArchiveQueryParams
  .omit({ from: true, to: true })
  .extend({ from: dateOnly.optional(), to: dateOnly.optional() })
  .refine(value => !value.from || !value.to || value.from <= value.to, {
    message: "تاريخ البداية يجب ألا يتجاوز تاريخ النهاية", path: ["to"],
  });

export const ARCHIVE_PAGE_SIZE = 10;

export function normalizeArchiveSearch(value: string): string {
  return value.trim().toLowerCase()
    .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

function searchCondition(search: string | undefined, name: AnyColumn, phone: AnyColumn, id: AnyColumn): SQL | undefined {
  const query = normalizeArchiveSearch(search ?? "");
  if (!query) return undefined;
  const digits = query.replace(/\D/g, "");
  // A local 05… phone and its international +9665… equivalent must match.
  const phoneQuery = digits.replace(/^(00966|966)/, "0");
  const normalizedPhone = sql`regexp_replace(regexp_replace(translate(coalesce(${phone}, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^(00966|966)', '0')`;
  const idQuery = query.replace(/^#\s*/, "");
  return sql`(
    position(${query} in lower(${name})) > 0
    OR position(${idQuery} in cast(${id} as text)) > 0
    ${digits && /^[+\d()\s-]+$/.test(query) ? sql`OR position(${phoneQuery} in ${normalizedPhone}) > 0` : sql``}
  )`;
}

function bounds(from: string | undefined, to: string | undefined, date: AnyColumn): (SQL | undefined)[] {
  return [from ? gte(date, from) : undefined, to ? lte(date, to) : undefined];
}

function pageFor(requested: number, total: number): number {
  return Math.min(requested, Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE)));
}

const liveTimes = {
  id: chaletsTable.id,
  checkInTime: chaletsTable.checkInTime, checkOutTime: chaletsTable.checkOutTime,
  morningCheckIn: chaletsTable.morningCheckIn, morningCheckOut: chaletsTable.morningCheckOut,
  eveningCheckIn: chaletsTable.eveningCheckIn, eveningCheckOut: chaletsTable.eveningCheckOut,
  fullDayCheckIn: chaletsTable.fullDayCheckIn, fullDayCheckOut: chaletsTable.fullDayCheckOut,
};
const draftTimes = {
  id: chaletSubmissionsTable.id,
  checkInTime: chaletSubmissionsTable.checkInTime, checkOutTime: chaletSubmissionsTable.checkOutTime,
  morningCheckIn: chaletSubmissionsTable.morningCheckIn, morningCheckOut: chaletSubmissionsTable.morningCheckOut,
  eveningCheckIn: chaletSubmissionsTable.eveningCheckIn, eveningCheckOut: chaletSubmissionsTable.eveningCheckOut,
  fullDayCheckIn: chaletSubmissionsTable.fullDayCheckIn, fullDayCheckOut: chaletSubmissionsTable.fullDayCheckOut,
};

/** Mounted after owner authentication; the caller supplies the session's resolved owner keys. */
export async function sendBookingArchive(req: Request, res: Response, ownerIds: string[]) {
  const parsed = archiveQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "فلاتر الأرشيف غير صالحة", details: parsed.error.flatten() });
  const query = parsed.data;
  const exportAll = query.export === "1";
  res.setHeader("Cache-Control", "private, no-store");

  if (query.tab === "rescheduled") {
    const t = ownerRescheduleLogsTable;
    const scope = inArray(t.ownerId, ownerIds);
    const where = and(scope, ...bounds(query.from, query.to, t.newDate),
      searchCondition(query.search, t.clientName, t.clientPhone, t.bookingId));
    const [[totals], yearRows] = await Promise.all([
      db.select({ total: count() }).from(t).where(where),
      db.selectDistinct({ year: sql<string>`substring(${t.newDate}, 1, 4)` }).from(t).where(scope),
    ]);
    const total = Number(totals.total);
    const page = pageFor(query.page, total);
    const rowsQuery = db.select().from(t).where(where).orderBy(desc(t.rescheduledAt), desc(t.id)).$dynamic();
    const rows = await (exportAll ? rowsQuery : rowsQuery.limit(ARCHIVE_PAGE_SIZE).offset((page - 1) * ARCHIVE_PAGE_SIZE));
    const bookingIds = [...new Set(rows.map(row => row.bookingId))];
    const linked = bookingIds.length ? await db.select({ id: ownerBookingsTable.id, submissionId: ownerBookingsTable.submissionId })
      .from(ownerBookingsTable).where(and(inArray(ownerBookingsTable.ownerId, ownerIds), inArray(ownerBookingsTable.id, bookingIds))) : [];
    const submissionByBooking = new Map(linked.map(row => [row.id, row.submissionId]));
    return res.json({ bookings: [], rescheduleLog: rows.map(row => ({ ...row, submissionId: submissionByBooking.get(row.bookingId) ?? null })), total, page, pageSize: ARCHIVE_PAGE_SIZE,
      years: yearRows.map(row => row.year).filter(year => /^\d{4}$/.test(year)).sort().reverse() });
  }

  const t = ownerBookingsTable;
  const scope = and(inArray(t.ownerId, ownerIds), query.tab === "cancelled" ? isNotNull(t.cancelledAt) : isNull(t.cancelledAt));
  const dateAndSearch = and(...bounds(query.from, query.to, t.bookingDate),
    searchCondition(query.search, t.clientName, t.clientPhone, t.id));
  let completeIds: number[] | undefined;
  if (query.tab === "completed") {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    // Classify only thin date/time records, not every archived booking's large contract/media fields.
    // The exact shared JS completion rule is retained for Arabic legacy and overnight schedules.
    const candidates = await db.select({
      id: t.id, bookingDate: t.bookingDate, durationDays: t.durationDays, period: t.period,
      live: liveTimes, draft: draftTimes,
    }).from(t)
      .leftJoin(chaletsTable, eq(chaletsTable.submissionId, t.submissionId))
      .leftJoin(chaletSubmissionsTable, eq(chaletSubmissionsTable.id, t.submissionId))
      .where(and(scope, dateAndSearch, lte(t.bookingDate, today)));
    const now = Date.now();
    completeIds = candidates.filter(row => isStayComplete(row, row.live ?? row.draft, now)).map(row => row.id);
  }
  const where = and(scope, dateAndSearch, completeIds ? inArray(t.id, completeIds) : undefined);
  const [[totals], yearRows] = await Promise.all([
    db.select({ total: count() }).from(t).where(where),
    db.selectDistinct({ year: sql<string>`substring(${t.bookingDate}, 1, 4)` }).from(t).where(scope),
  ]);
  const total = Number(totals.total);
  const page = pageFor(query.page, total);
  // No archive action needs the potentially large signature bitmap.
  const { contractSignatureDataUrl: _signature, ...columns } = getTableColumns(t);
  const rowsQuery = db.select(columns).from(t).where(where).orderBy(desc(t.bookingDate), desc(t.id)).$dynamic();
  const rows = await (exportAll ? rowsQuery : rowsQuery.limit(ARCHIVE_PAGE_SIZE).offset((page - 1) * ARCHIVE_PAGE_SIZE));
  const ids = rows.map(row => row.id);
  const logs = ids.length ? await db.select({ bookingId: ownerRescheduleLogsTable.bookingId, oldDate: ownerRescheduleLogsTable.oldDate, reason: ownerRescheduleLogsTable.reason })
    .from(ownerRescheduleLogsTable)
    .where(and(inArray(ownerRescheduleLogsTable.ownerId, ownerIds), inArray(ownerRescheduleLogsTable.bookingId, ids)))
    .orderBy(desc(ownerRescheduleLogsTable.rescheduledAt), desc(ownerRescheduleLogsTable.id)) : [];
  const latestLog = new Map<number, typeof logs[number]>();
  for (const log of logs) if (!latestLog.has(log.bookingId)) latestLog.set(log.bookingId, log);
  return res.json({
    bookings: rows.map(row => ({ ...row, isRescheduled: latestLog.has(row.id),
      originalDate: latestLog.get(row.id)?.oldDate ?? null, rescheduleReason: latestLog.get(row.id)?.reason ?? null })),
    rescheduleLog: [], total, page, pageSize: ARCHIVE_PAGE_SIZE,
    years: yearRows.map(row => row.year).filter(year => /^\d{4}$/.test(year)).sort().reverse(),
  });
}
