import { Router, type IRouter } from "express";
import { db, chaletsTable } from "@workspace/db";
import { chaletAvailabilityTable } from "@workspace/db/schema";
import { eq, lte, gte, and, sql, type SQL } from "drizzle-orm";
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
