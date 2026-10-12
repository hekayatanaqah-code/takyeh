import { Router } from "express";
import { db, ownerServicesTable, citiesCatalogTable, regionsCatalogTable } from "@workspace/db";
import { and, asc, isNull, ne, eq } from "drizzle-orm";
import { requireAuth, getOwnerIds } from "./owner";
import { photographyActivities } from "../lib/photography-targets";
const router = Router();
router.get("/", requireAuth, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const services = await db.select().from(ownerServicesTable)
    .where(and(isNull(ownerServicesTable.deletedAt), ne(ownerServicesTable.state, "hidden")))
    .orderBy(asc(ownerServicesTable.sortOrder), asc(ownerServicesTable.id));
  const activities = await photographyActivities(await getOwnerIds(req));
  const cities = await db.select({ id: citiesCatalogTable.id, name: citiesCatalogTable.name, region: regionsCatalogTable.name })
    .from(citiesCatalogTable).innerJoin(regionsCatalogTable, eq(citiesCatalogTable.regionId, regionsCatalogTable.id))
    .where(and(eq(citiesCatalogTable.isActive, true), eq(regionsCatalogTable.isActive, true)));
  const ownerCities = new Set(cities.filter(c => [...activities.properties, ...activities.services]
    .some(a => a.location === c.name && a.region === c.region)).map(c => c.id));
  return res.json({ services: services.filter(s => s.coverageCityIds.some(id => ownerCities.has(id))) });
});
export default router;
