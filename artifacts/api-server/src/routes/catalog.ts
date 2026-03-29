import { Router } from "express";
import { db } from "@workspace/db";
import { citiesCatalogTable, amenitiesCatalogTable, districtsCatalogTable, chaletCategoriesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/cities", async (_req, res) => {
  const rows = await db
    .select()
    .from(citiesCatalogTable)
    .orderBy(citiesCatalogTable.name);
  return res.json(rows.filter((r) => r.isActive));
});

router.get("/districts", async (req, res) => {
  const cityId = req.query.cityId ? Number(req.query.cityId) : null;
  let rows = await db
    .select()
    .from(districtsCatalogTable)
    .orderBy(districtsCatalogTable.name);
  rows = rows.filter((r) => r.isActive);
  if (cityId) {
    rows = rows.filter((r) => r.cityId === cityId);
  }
  return res.json(rows);
});

router.get("/amenities", async (_req, res) => {
  const rows = await db
    .select()
    .from(amenitiesCatalogTable)
    .orderBy(amenitiesCatalogTable.createdAt);
  return res.json(rows.filter((r) => r.isActive));
});

router.get("/categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(chaletCategoriesTable)
    .orderBy(chaletCategoriesTable.createdAt);
  return res.json(rows.filter((r) => r.isActive));
});

export default router;
