import { Router } from "express";
import { db } from "@workspace/db";
import { citiesCatalogTable, amenitiesCatalogTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/cities", async (_req, res) => {
  const rows = await db
    .select()
    .from(citiesCatalogTable)
    .orderBy(citiesCatalogTable.name);
  return res.json(rows.filter((r) => r.isActive));
});

router.get("/amenities", async (_req, res) => {
  const rows = await db
    .select()
    .from(amenitiesCatalogTable)
    .orderBy(amenitiesCatalogTable.createdAt);
  return res.json(rows.filter((r) => r.isActive));
});

export default router;
