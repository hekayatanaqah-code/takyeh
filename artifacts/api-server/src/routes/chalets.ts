import { Router, type IRouter } from "express";
import { db, chaletsTable } from "@workspace/db";
import { eq, lte, gte, and, type SQL } from "drizzle-orm";
import {
  GetChaletsQueryParams,
  GetChaletByIdParams,
  GetChaletByIdResponse,
  GetChaletsResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/", async (req, res) => {
  const parseResult = GetChaletsQueryParams.safeParse(req.query);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { location, maxGuests, maxPrice } = parseResult.data;

  const conditions: SQL[] = [];

  if (location) {
    conditions.push(eq(chaletsTable.location, location));
  }
  if (maxGuests !== undefined) {
    conditions.push(gte(chaletsTable.maxGuests, maxGuests));
  }
  if (maxPrice !== undefined) {
    conditions.push(lte(chaletsTable.pricePerNight, String(maxPrice)));
  }

  const rows = await db
    .select()
    .from(chaletsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(chaletsTable.id);

  const data = rows.map((row) =>
    GetChaletsResponseItem.parse({
      id: row.id,
      nameAr: row.nameAr,
      descriptionAr: row.descriptionAr,
      location: row.location,
      district: row.district ?? null,
      category: row.category ?? null,
      pricePerNight: Number(row.pricePerNight),
      maxGuests: row.maxGuests,
      bedrooms: row.bedrooms,
      amenities: row.amenities,
      photos: row.photos,
      whatsappNumber: row.whatsappNumber,
      mapsUrl: row.mapsUrl ?? null,
      isVerified: row.isVerified ?? false,
      createdAt: row.createdAt,
    })
  );

  res.json(data);
});

router.get("/:id", async (req, res) => {
  const parseResult = GetChaletByIdParams.safeParse({ id: req.params.id });
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid chalet ID" });
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
  const data = GetChaletByIdResponse.parse({
    id: row.id,
    nameAr: row.nameAr,
    descriptionAr: row.descriptionAr,
    location: row.location,
    district: row.district ?? null,
    category: row.category ?? null,
    pricePerNight: Number(row.pricePerNight),
    maxGuests: row.maxGuests,
    bedrooms: row.bedrooms,
    amenities: row.amenities,
    photos: row.photos,
    whatsappNumber: row.whatsappNumber,
    mapsUrl: row.mapsUrl ?? null,
    isVerified: row.isVerified ?? false,
    createdAt: row.createdAt,
  });

  res.json(data);
});

export default router;
