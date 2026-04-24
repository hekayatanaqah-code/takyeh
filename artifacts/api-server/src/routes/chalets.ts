import { Router, type IRouter } from "express";
import { db, chaletsTable } from "@workspace/db";
import { chaletAvailabilityTable } from "@workspace/db/schema";
import { eq, lte, gte, and, sql, inArray, type SQL } from "drizzle-orm";
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

function isPausedNow(row: { pausedFrom?: string | null; pausedUntil?: string | null }, today = todayStr()) {
  if (!row.pausedFrom) return false;
  return row.pausedFrom <= today && (!row.pausedUntil || row.pausedUntil >= today);
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

  const conditions: SQL[] = [eq(chaletsTable.isActive, true)];

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

    /* Additionally filter by dailyPrices granularity when period is specified */
    if (searchPeriod) {
      const dayOfWeek = new Date(searchDate + "T12:00:00").getDay();
      const periodKey = searchPeriod === "full_day" ? "fullday" : searchPeriod;
      rows = rows.filter((row) => {
        const daily = row.dailyPrices as Record<string, Record<string, number>> | null;
        if (daily) {
          /* dailyPrices is set — only include chalet if this day+period has a price */
          return daily[periodKey]?.[String(dayOfWeek)] != null;
        }
        /* No dailyPrices — fall back to slot booleans */
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
    checkInTime: row.checkInTime ?? null,
    checkOutTime: row.checkOutTime ?? null,
    morningCheckIn: row.morningCheckIn ?? null,
    morningCheckOut: row.morningCheckOut ?? null,
    eveningCheckIn: row.eveningCheckIn ?? null,
    eveningCheckOut: row.eveningCheckOut ?? null,
    fullDayCheckIn: row.fullDayCheckIn ?? null,
    fullDayCheckOut: row.fullDayCheckOut ?? null,
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

  /* 4. For each chalet, find its earliest available future date */
  const result: Array<{ chalet: (typeof activeChalets)[0]; nextAvailableDate: string }> = [];

  for (const chalet of activeChalets) {
    const chaletBlocks = blockMap.get(chalet.id) ?? new Map();

    for (const futureDate of futureDates) {
      const entry = chaletBlocks.get(futureDate);
      let available = true;

      if (entry) {
        if (period === "morning")   available = !entry.periodMorning;
        else if (period === "evening")  available = !entry.periodEvening;
        else if (period === "full_day") available = !entry.periodFullDay;
        else available = !(entry.periodMorning || entry.periodEvening || entry.periodFullDay);
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
    checkInTime: row.checkInTime ?? null,
    checkOutTime: row.checkOutTime ?? null,
    morningCheckIn: row.morningCheckIn ?? null,
    morningCheckOut: row.morningCheckOut ?? null,
    eveningCheckIn: row.eveningCheckIn ?? null,
    eveningCheckOut: row.eveningCheckOut ?? null,
    fullDayCheckIn: row.fullDayCheckIn ?? null,
    fullDayCheckOut: row.fullDayCheckOut ?? null,
  };

  res.json(data);
});

export default router;
