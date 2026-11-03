import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { db, pool } from "@workspace/db";
import { serviceCityRequestsTable as requests, serviceCitiesCatalogTable as cities, serviceRegionsCatalogTable as regions, citiesCatalogTable as propertyCities } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { CityRequestError, createCityRequest, reviewCityRequest } from "./service-city-requests";

test("city request lifecycle is atomic, deduplicated and isolated from property cities", async () => {
  const rollback = new Error("rollback isolated city-request fixtures");
  try {
    await db.transaction(async tx => {
      const [region] = await tx.select().from(regions).where(eq(regions.isActive, true)).limit(1);
      assert.ok(region, "An existing active service region is required; never seed real inventory.");
      const [{ count: before }] = await tx.select({ count: sql<number>`count(*)::integer` }).from(propertyCities);
      const suffix = randomUUID();
      const actor = `city-request-test-${suffix}`;
      const city = `مدينة اختبار ${suffix}`;
      const pending = await createCityRequest({ city, regionId: region.id }, actor, "مقدم خدمة تجريبي", tx);
      assert.equal(pending.status, "pending");
      assert.equal(pending.approvedCityId, null);
      const duplicate = await createCityRequest({ city: ` ${city} `, regionId: region.id }, actor, "مقدم خدمة تجريبي", tx);
      assert.equal(duplicate.id, pending.id);
      const otherPending = await createCityRequest({ city, regionId: region.id }, `${actor}-other`, "مقدم خدمة تجريبي", tx);
      const approved = await reviewCityRequest(pending.id, { decision: "approve", regionId: region.id }, actor, tx);
      assert.equal(approved.status, "approved");
      assert.equal(approved.regionName, region.name);
      assert.ok(approved.approvedCityId);
      const [added] = await tx.select().from(cities).where(eq(cities.id, approved.approvedCityId));
      assert.equal(added.name, city);
      assert.equal(added.isActive, true);
      const alsoApproved = await reviewCityRequest(otherPending.id, { decision: "approve", regionId: region.id }, actor, tx);
      assert.equal(alsoApproved.approvedCityId, approved.approvedCityId);
      await assert.rejects(() => reviewCityRequest(pending.id, { decision: "reject" }, actor, tx), error => error instanceof CityRequestError && error.status === 409);
      await assert.rejects(() => createCityRequest({ city, regionId: region.id }, actor, "مقدم خدمة تجريبي", tx), error => error instanceof CityRequestError && error.status === 409);

      const rejectedRequest = await createCityRequest({ city: `مرفوضة ${suffix}` }, actor, "مقدم خدمة تجريبي", tx);
      await assert.rejects(() => reviewCityRequest(rejectedRequest.id, { decision: "approve" }, actor, tx), error => error instanceof CityRequestError && error.status === 400);
      const [stillPending] = await tx.select().from(requests).where(eq(requests.id, rejectedRequest.id));
      assert.equal(stillPending.status, "pending");
      const rejected = await reviewCityRequest(rejectedRequest.id, { decision: "reject", reason: "خارج النطاق المعتمد" }, actor, tx);
      assert.equal(rejected.status, "rejected");
      assert.equal(rejected.reason, "خارج النطاق المعتمد");
      assert.equal(rejected.approvedCityId, null);

      const another = await createCityRequest({ city, regionId: region.id }, `${actor}-another`, "مقدم خدمة تجريبي", tx).catch(error => {
        assert.ok(error instanceof CityRequestError && error.status === 409);
        return null;
      });
      assert.equal(another, null);
      const [{ count: after }] = await tx.select({ count: sql<number>`count(*)::integer` }).from(propertyCities);
      assert.equal(after, before);
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await pool.end();
  }
});
