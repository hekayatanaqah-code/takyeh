import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, it } from "node:test";
import express from "express";
import { eq } from "drizzle-orm";
import { db, pool, serviceCategoriesTable, serviceRegionsCatalogTable, serviceCitiesCatalogTable, citiesCatalogTable } from "@workspace/db";
import providersRouter from "./providers";

let server: Server;
let base: string;
let categoryId: number, regionId: number, cityId: number, propertyCityId: number;
const token = randomUUID();
const categoryKey = `catalog-test-${token}`;
const serviceCityName = `مدينة خدمة اختبار ${token}`;
const propertyCityName = `مدينة عقار اختبار ${token}`;
before(async () => {
  const [category] = await db.insert(serviceCategoriesTable).values({ key: categoryKey, labelAr: `فئة اختبار ${token}`, isActive: true }).returning();
  categoryId = category.id;
  const [region] = await db.insert(serviceRegionsCatalogTable).values({ name: `منطقة اختبار ${token}` }).returning();
  regionId = region.id;
  const [city] = await db.insert(serviceCitiesCatalogTable).values({ name: serviceCityName, regionId }).returning();
  cityId = city.id;
  const [propertyCity] = await db.insert(citiesCatalogTable).values({ name: propertyCityName }).returning();
  propertyCityId = propertyCity.id;
  const app = express();
  app.use("/api/providers", providersRouter);
  server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => {
  if (server) await new Promise<void>(resolve => server.close(() => resolve()));
  if (cityId) await db.delete(serviceCitiesCatalogTable).where(eq(serviceCitiesCatalogTable.id, cityId));
  if (regionId) await db.delete(serviceRegionsCatalogTable).where(eq(serviceRegionsCatalogTable.id, regionId));
  if (categoryId) await db.delete(serviceCategoriesTable).where(eq(serviceCategoriesTable.id, categoryId));
  if (propertyCityId) await db.delete(citiesCatalogTable).where(eq(citiesCatalogTable.id, propertyCityId));
  await pool.end();
});
async function options() {
  const response = await fetch(`${base}/api/providers/search-options`);
  assert.equal(response.status, 200);
  return response.json() as Promise<{ categories: { key: string }[]; cities: { name: string }[] }>;
}
it("automatically offers newly active categories and service cities without inventory", async () => {
  const result = await options();
  assert.ok(result.categories.some(category => category.key === categoryKey));
  assert.ok(result.cities.some(city => city.name === serviceCityName));
  assert.ok(!result.cities.some(city => city.name === propertyCityName));
});
it("removes disabled categories and cities under disabled service regions", async () => {
  await db.update(serviceCategoriesTable).set({ isActive: false }).where(eq(serviceCategoriesTable.id, categoryId));
  await db.update(serviceRegionsCatalogTable).set({ isActive: false }).where(eq(serviceRegionsCatalogTable.id, regionId));
  const result = await options();
  assert.ok(!result.categories.some(category => category.key === categoryKey));
  assert.ok(!result.cities.some(city => city.name === serviceCityName));
});