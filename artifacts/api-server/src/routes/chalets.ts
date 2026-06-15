import { Router, type IRouter } from "express";
import { db, chaletsTable } from "@workspace/db";
import { chaletAvailabilityTable, ownerBookingsTable, chaletServicesTable } from "@workspace/db/schema";
import { eq, lte, gte, and, sql, inArray, isNull, type SQL } from "drizzle-orm";
import {
  GetChaletsQueryParams,
  GetChaletByIdParams,
  GetChaletByIdResponse,
  GetChaletsResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isPausedNow(row: { pausedFrom?: string | null; pausedUntil?: string | null }, today = todayStr()) {
  if (!row.pausedFrom) return false;
  return row.pausedFrom <= today && (!row.pausedUntil || row.pausedUntil >= today);
}

type BufferExceptionDate = { date: string; periods: string[]; action: "disable" | "enable" };
type BookingForBuffer = { bookingDate: string; durationDays: number; period: string | null };
type ChaletForBuffer = {
  bufferPolicyEnabled: boolean;
  bufferBlockNextMorningFullDay: boolean;
  bufferBlockNextMorningEvening: boolean;
  bufferBlockSameDayEvening: boolean;
  bufferExceptionWeekdays: string | null;
  bufferExceptionDates: string | null;
};

/**
 * Returns true if the given dateStr+period slot is a cleaning buffer block
 * (i.e. it should be treated as occupied in public search).
 * Priority: specific-date exception > weekday exception > general rules.
 */
function isBufferCleaning(
  chalet: ChaletForBuffer,
  bookings: BookingForBuffer[],
  dateStr: string,
  period: "morning" | "evening",
): boolean {
  if (!chalet.bufferPolicyEnabled) return false;

  let exWeekdays: number[] = [];
  let exDates: BufferExceptionDate[] = [];
  try { exWeekdays = JSON.parse(chalet.bufferExceptionWeekdays ?? "[]"); } catch { /* */ }
  try { exDates = JSON.parse(chalet.bufferExceptionDates ?? "[]"); } catch { /* */ }

  /* Determine if any booking produces a cleaning slot here */
  let wouldBeCleaning = false;
  for (const b of bookings) {
    if (!b.bookingDate) continue;
    const dur = Math.max(1, b.durationDays ?? 1);
    const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
    const lastD = new Date(sy, sm - 1, sd + dur - 1);
    const lastDs = fmtDate(lastD);
    const nextD = new Date(lastD); nextD.setDate(nextD.getDate() + 1);
    const nextDs = fmtDate(nextD);
    const bp = b.period ?? "full_day";

    if (period === "morning") {
      if (chalet.bufferBlockNextMorningFullDay && bp === "full_day" && nextDs === dateStr) { wouldBeCleaning = true; break; }
      if (chalet.bufferBlockNextMorningEvening && bp === "evening" && nextDs === dateStr) { wouldBeCleaning = true; break; }
    } else {
      if (chalet.bufferBlockSameDayEvening && bp === "morning" && lastDs === dateStr) { wouldBeCleaning = true; break; }
    }
  }

  if (!wouldBeCleaning) return false;

  /* ── Exception priority ── */
  /* 1. Specific-date exception (highest) */
  const dateEx = exDates.find((e) => e.date === dateStr && e.periods.includes(period));
  if (dateEx) return dateEx.action === "enable"; /* "disable" → not a cleaning block */

  /* 2. Weekday exception */
  const dow = new Date(dateStr + "T12:00:00").getDay();
  if (exWeekdays.includes(dow)) return false;

  /* 3. General rules — is a cleaning block */
  return true;
}

/** True if the searched date+period is blocked by the buffer policy */
function isBufferBlocked(
  chalet: ChaletForBuffer,
  bookings: BookingForBuffer[],
  searchDate: string,
  searchPeriod: string | undefined,
): boolean {
  if (!chalet.bufferPolicyEnabled) return false;
  const periods: Array<"morning" | "evening"> =
    searchPeriod === "morning" ? ["morning"] :
    searchPeriod === "evening" ? ["evening"] :
    ["morning", "evening"];
  return periods.some((p) => isBufferCleaning(chalet, bookings, searchDate, p));
}

router.get("/", async (req, res) => {
  const parseResult = GetChaletsQueryParams.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { location, maxGuests, maxPrice } = parseResult.data;
  const sections = req.query.sections as string | undefined;
  const searchDate = req.query.date as string | undefined;
  const searchPeriod = req.query.period as string | undefined;

  const conditions: SQL[] = [eq(chaletsTable.isActive, true), isNull(chaletsTable.deletedAt)];

  if (location) {
    conditions.push(eq(chaletsTable.location, location));
  }
  if (maxGuests !== undefined) {
    conditions.push(gte(chaletsTable.maxGuests, maxGuests));
  }
  if (maxPrice !== undefined) {
    conditions.push(lte(chaletsTable.pricePerNight, String(maxPrice)));
  }
  if (sections) {
    conditions.push(eq(chaletsTable.sections, sections));
  }

  let rows = await db
    .select()
    .from(chaletsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`RANDOM()`);

  rows = rows.filter((row) => !isPausedNow(row));

  /* ── Availability filter ─────────────────────────────────── */
  if (searchDate && /^\d{4}-\d{2}-\d{2}$/.test(searchDate)) {
    const blockedEntries = await db
      .select()
      .from(chaletAvailabilityTable)
      .where(eq(chaletAvailabilityTable.dateStr, searchDate));

    if (blockedEntries.length > 0) {
      const blockMap = new Map(blockedEntries.map((b) => [b.chaletId, b]));

      rows = rows.filter((row) => {
        const entry = blockMap.get(row.id);
        if (!entry) return true;

        if (searchPeriod === "morning") return !entry.periodMorning;
        if (searchPeriod === "evening") return !entry.periodEvening;
        if (searchPeriod === "full_day") return !entry.periodFullDay;
        return !(entry.periodMorning || entry.periodEvening || entry.periodFullDay);
      });
    }

    /* ── Buffer / Cleaning Time sync ────────────────────────
       Fetch bookings for buffer-enabled chalets and treat
       cleaning slots as occupied in public search results.
    ────────────────────────────────────────────────────────── */
    const bufferChalets = rows.filter((r) => r.bufferPolicyEnabled);
    if (bufferChalets.length > 0) {
      const bufferSubIds = bufferChalets
        .map((r) => r.submissionId)
        .filter((id): id is number => id != null);

      /* Bookings starting up to 30 days before searchDate can produce cleaning slots on searchDate */
      const lookbackDate = fmtDate(
        new Date(new Date(searchDate + "T12:00:00").getTime() - 30 * 86400000),
      );

      const relevantBookings = bufferSubIds.length > 0
        ? await db
            .select({
              submissionId: ownerBookingsTable.submissionId,
              bookingDate: ownerBookingsTable.bookingDate,
              durationDays: ownerBookingsTable.durationDays,
              period: ownerBookingsTable.period,
            })
            .from(ownerBookingsTable)
            .where(
              and(
                inArray(ownerBookingsTable.submissionId, bufferSubIds),
                isNull(ownerBookingsTable.cancelledAt),
                gte(ownerBookingsTable.bookingDate, lookbackDate),
                lte(ownerBookingsTable.bookingDate, searchDate),
              ),
            )
        : [];

      /* Group bookings by submissionId */
      const bookingsBySubId = new Map<number, BookingForBuffer[]>();
      for (const b of relevantBookings) {
        if (b.submissionId == null) continue;
        const key = b.submissionId;
        if (!bookingsBySubId.has(key)) bookingsBySubId.set(key, []);
        bookingsBySubId.get(key)!.push({
          bookingDate: b.bookingDate,
          durationDays: b.durationDays,
          period: b.period,
        });
      }

      rows = rows.filter((row) => {
        if (!row.bufferPolicyEnabled || row.submissionId == null) return true;
        const bookings = bookingsBySubId.get(row.submissionId) ?? [];
        return !isBufferBlocked(row, bookings, searchDate, searchPeriod);
      });
    }

    /* Additionally filter by dailyPrices granularity when period is specified */
    if (searchPeriod) {
      const dayOfWeek = new Date(searchDate + "T12:00:00").getDay();
      const periodKey = searchPeriod === "full_day" ? "fullday" : searchPeriod;
      rows = rows.filter((row) => {
        const daily = row.dailyPrices as Record<string, Record<string, number>> | null;
        if (daily) {
          return daily[periodKey]?.[String(dayOfWeek)] != null;
        }
        if (searchPeriod === "morning") return row.slotMorning ?? true;
        if (searchPeriod === "evening") return row.slotEvening ?? true;
        if (searchPeriod === "full_day") return row.slotFullDay ?? true;
        return true;
      });
    }
  }

  const data = rows.map((row) => ({
    ...GetChaletsResponseItem.parse({
      id: row.id,
      nameAr: row.nameAr,
      descriptionAr: row.descriptionAr,
      location: row.location,
      district: row.district ?? null,
      category: row.category ?? null,
      pricePerNight: Number(row.pricePerNight),
      maxGuests: row.maxGuests ?? 0,
      bedrooms: row.bedrooms ?? 0,
      amenities: row.amenities,
      photos: row.photos,
      whatsappNumber: row.whatsappNumber,
      mapsUrl: row.mapsUrl ?? null,
      isVerified: row.isVerified ?? false,
      createdAt: row.createdAt,
    }),
    maxGuests: row.maxGuests ?? null,
    bedrooms: row.bedrooms ?? null,
    propertyType: row.propertyType ?? null,
    sections: row.sections ?? null,
    priceMorning: row.priceMorning ?? null,
    priceEvening: row.priceEvening ?? null,
    priceFullDay: row.priceFullDay ?? null,
    slotMorning: row.slotMorning ?? true,
    slotEvening: row.slotEvening ?? true,
    slotFullDay: row.slotFullDay ?? true,
    priceWeekday: row.priceWeekday ?? null,
    priceWeekend: row.priceWeekend ?? null,
    seasonalDisclaimer: row.seasonalDisclaimer ?? true,
    termsAndConditions: row.termsAndConditions ?? null,
    socialLink: row.socialLink ?? null,
    logoUrl: row.logoUrl ?? null,
    checkInTime: row.checkInTime ?? null,
    checkOutTime: row.checkOutTime ?? null,
    morningCheckIn: row.morningCheckIn ?? null,
    morningCheckOut: row.morningCheckOut ?? null,
    eveningCheckIn: row.eveningCheckIn ?? null,
    eveningCheckOut: row.eveningCheckOut ?? null,
    fullDayCheckIn: row.fullDayCheckIn ?? null,
    fullDayCheckOut: row.fullDayCheckOut ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
  }));

  res.json(data);
});

/* ── Next Available Dates ──────────────────────────────────────
   GET /api/chalets/next-available?location=بريدة&date=2026-05-01&period=morning
   Returns chalets in the city with the next available date, up to 45 days ahead.
   Response: { cityEmpty: boolean, chalets: Array<chalet & { nextAvailableDate: string }> }
──────────────────────────────────────────────────────────────── */
router.get("/next-available", async (req, res) => {
  const location = req.query.location as string | undefined;
  const date = req.query.date as string | undefined;
  const period = req.query.period as string | undefined;
  const lookAhead = Math.min(Number(req.query.lookAhead) || 45, 60);

  if (!location || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "location and valid date required" });
    return;
  }

  /* 1. Get all active chalets in the city */
  const allChalets = await db
    .select()
    .from(chaletsTable)
    .where(and(eq(chaletsTable.isActive, true), eq(chaletsTable.location, location)));

  const activeChalets = allChalets.filter((row) => !isPausedNow(row));

  if (activeChalets.length === 0) {
    res.json({ cityEmpty: true, chalets: [] });
    return;
  }

  /* 2. Build the future date list: date+1 … date+lookAhead */
  const startDate = new Date(date + "T12:00:00Z");
  const futureDates: string[] = [];
  for (let i = 1; i <= lookAhead; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    futureDates.push(d.toISOString().slice(0, 10));
  }
  const endDate = futureDates[futureDates.length - 1];

  /* 3. Bulk-fetch all availability blocks for these chalets in the date range */
  const chaletIds = activeChalets.map((c) => c.id);
  const blockedEntries = await db
    .select()
    .from(chaletAvailabilityTable)
    .where(
      and(
        inArray(chaletAvailabilityTable.chaletId, chaletIds),
        gte(chaletAvailabilityTable.dateStr, date),
        lte(chaletAvailabilityTable.dateStr, endDate)
      )
    );

  /* blockMap: chaletId -> Map<dateStr, entry> */
  const blockMap = new Map<number, Map<string, (typeof blockedEntries)[0]>>();
  for (const entry of blockedEntries) {
    if (!blockMap.has(entry.chaletId)) blockMap.set(entry.chaletId, new Map());
    blockMap.get(entry.chaletId)!.set(entry.dateStr, entry);
  }

  /* 3b. Bulk-fetch bookings for buffer-enabled chalets (for cleaning slot computation) */
  const bufferChalets = activeChalets.filter((c) => c.bufferPolicyEnabled);
  const bufferSubIds = bufferChalets
    .map((c) => c.submissionId)
    .filter((id): id is number => id != null);

  const lookbackDate = fmtDate(
    new Date(new Date(date + "T12:00:00Z").getTime() - 30 * 86400000),
  );

  const allBufferBookings = bufferSubIds.length > 0
    ? await db
        .select({
          submissionId: ownerBookingsTable.submissionId,
          bookingDate: ownerBookingsTable.bookingDate,
          durationDays: ownerBookingsTable.durationDays,
          period: ownerBookingsTable.period,
        })
        .from(ownerBookingsTable)
        .where(
          and(
            inArray(ownerBookingsTable.submissionId, bufferSubIds),
            isNull(ownerBookingsTable.cancelledAt),
            gte(ownerBookingsTable.bookingDate, lookbackDate),
            lte(ownerBookingsTable.bookingDate, endDate),
          ),
        )
    : [];

  const bufferBookingsBySubId = new Map<number, BookingForBuffer[]>();
  for (const b of allBufferBookings) {
    if (b.submissionId == null) continue;
    if (!bufferBookingsBySubId.has(b.submissionId)) bufferBookingsBySubId.set(b.submissionId, []);
    bufferBookingsBySubId.get(b.submissionId)!.push({
      bookingDate: b.bookingDate,
      durationDays: b.durationDays,
      period: b.period,
    });
  }

  /* 4. For each chalet, find its earliest available future date */
  const result: Array<{ chalet: (typeof activeChalets)[0]; nextAvailableDate: string }> = [];

  for (const chalet of activeChalets) {
    const chaletBlocks = blockMap.get(chalet.id) ?? new Map();
    const bufferBookings = chalet.submissionId != null
      ? (bufferBookingsBySubId.get(chalet.submissionId) ?? [])
      : [];

    for (const futureDate of futureDates) {
      const entry = chaletBlocks.get(futureDate);
      let available = true;

      if (entry) {
        if (period === "morning")   available = !entry.periodMorning;
        else if (period === "evening")  available = !entry.periodEvening;
        else if (period === "full_day") available = !entry.periodFullDay;
        else available = !(entry.periodMorning || entry.periodEvening || entry.periodFullDay);
      }

      /* Also check buffer cleaning blocks */
      if (available && chalet.bufferPolicyEnabled) {
        if (isBufferBlocked(chalet, bufferBookings, futureDate, period)) {
          available = false;
        }
      }

      if (available) {
        result.push({ chalet, nextAvailableDate: futureDate });
        break;
      }
    }
    /* If no available date found within lookAhead, chalet is omitted */
  }

  /* 5. Sort by nextAvailableDate, then format response */
  result.sort((a, b) => a.nextAvailableDate.localeCompare(b.nextAvailableDate));

  const chalets = result.map(({ chalet, nextAvailableDate }) => ({
    id: chalet.id,
    nameAr: chalet.nameAr,
    descriptionAr: chalet.descriptionAr,
    location: chalet.location,
    district: chalet.district ?? null,
    category: chalet.category ?? null,
    pricePerNight: Number(chalet.pricePerNight),
    maxGuests: chalet.maxGuests ?? 0,
    bedrooms: chalet.bedrooms ?? 0,
    amenities: chalet.amenities,
    photos: chalet.photos,
    whatsappNumber: chalet.whatsappNumber,
    mapsUrl: chalet.mapsUrl ?? null,
    isVerified: chalet.isVerified ?? false,
    propertyType: chalet.propertyType ?? null,
    sections: chalet.sections ?? null,
    priceMorning: chalet.priceMorning ?? null,
    priceEvening: chalet.priceEvening ?? null,
    priceFullDay: chalet.priceFullDay ?? null,
    slotMorning: chalet.slotMorning ?? true,
    slotEvening: chalet.slotEvening ?? true,
    slotFullDay: chalet.slotFullDay ?? true,
    priceWeekday: chalet.priceWeekday ?? null,
    priceWeekend: chalet.priceWeekend ?? null,
    socialLink: chalet.socialLink ?? null,
    nextAvailableDate,
  }));

  res.json({ cityEmpty: false, chalets });
});

router.get("/:id", async (req, res) => {
  const parseResult = GetChaletByIdParams.safeParse({ id: req.params.id });
  if (!parseResult.success) {
    res.status(404).json({ error: "Invalid chalet ID" });
    return;
  }

  const { id } = parseResult.data;

  const rows = await db
    .select()
    .from(chaletsTable)
    .where(eq(chaletsTable.id, id))
    .limit(1);

  if (rows.length === 0) {
    res.status(404).json({ error: "Chalet not found" });
    return;
  }

  const row = rows[0];
  if (row.isActive === false || isPausedNow(row)) {
    res.status(404).json({ error: "Chalet not found" });
    return;
  }
  const data = {
    ...GetChaletByIdResponse.parse({
      id: row.id,
      nameAr: row.nameAr,
      descriptionAr: row.descriptionAr,
      location: row.location,
      district: row.district ?? null,
      category: row.category ?? null,
      pricePerNight: Number(row.pricePerNight),
      maxGuests: row.maxGuests ?? 0,
      bedrooms: row.bedrooms ?? 0,
      amenities: row.amenities,
      photos: row.photos,
      whatsappNumber: row.whatsappNumber,
      mapsUrl: row.mapsUrl ?? null,
      isVerified: row.isVerified ?? false,
      createdAt: row.createdAt,
    }),
    maxGuests: row.maxGuests ?? null,
    bedrooms: row.bedrooms ?? null,
    propertyType: row.propertyType ?? null,
    sections: row.sections ?? null,
    priceMorning: row.priceMorning ?? null,
    priceEvening: row.priceEvening ?? null,
    priceFullDay: row.priceFullDay ?? null,
    slotMorning: row.slotMorning ?? true,
    slotEvening: row.slotEvening ?? true,
    slotFullDay: row.slotFullDay ?? true,
    priceWeekday: row.priceWeekday ?? null,
    priceWeekend: row.priceWeekend ?? null,
    dailyPrices: (row.dailyPrices as Record<string, Record<string, number>> | null) ?? null,
    seasonalDisclaimer: row.seasonalDisclaimer ?? true,
    termsAndConditions: row.termsAndConditions ?? null,
    socialLink: row.socialLink ?? null,
    logoUrl: row.logoUrl ?? null,
    checkInTime: row.checkInTime ?? null,
    checkOutTime: row.checkOutTime ?? null,
    morningCheckIn: row.morningCheckIn ?? null,
    morningCheckOut: row.morningCheckOut ?? null,
    eveningCheckIn: row.eveningCheckIn ?? null,
    eveningCheckOut: row.eveningCheckOut ?? null,
    fullDayCheckIn: row.fullDayCheckIn ?? null,
    fullDayCheckOut: row.fullDayCheckOut ?? null,
    latitude: row.latitude != null ? Number(row.latitude) : null,
    longitude: row.longitude != null ? Number(row.longitude) : null,
  };

  res.json(data);
});

/* GET /chalets/:id/services — public, returns active add-on services for a chalet */
router.get("/:id/services", async (req, res) => {
  const chaletId = Number(req.params.id);
  if (!chaletId) return res.json([]);
  const services = await db.select({
    id: chaletServicesTable.id,
    name: chaletServicesTable.name,
    category: chaletServicesTable.category,
    description: chaletServicesTable.description,
    price: chaletServicesTable.price,
    unit: chaletServicesTable.unit,
    imageUrl: chaletServicesTable.imageUrl,
    galleryPhotos: chaletServicesTable.galleryPhotos,
    minPersons: chaletServicesTable.minPersons,
    maxPersons: chaletServicesTable.maxPersons,
  }).from(chaletServicesTable)
    .where(and(eq(chaletServicesTable.chaletId, chaletId), eq(chaletServicesTable.isActive, true)))
    .orderBy(chaletServicesTable.createdAt);
  return res.json(services);
});

export default router;
