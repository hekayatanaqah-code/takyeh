import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import app from "../app";
import { createSession } from "../lib/auth";
import {
  db,
  pool,
  serviceCitiesCatalogTable,
  serviceProviderSubmissionsTable,
  serviceRegionsCatalogTable,
  sessionsTable,
} from "@workspace/db";

let server: Server;
let baseUrl: string;
let sessionId: string;
const ownerId = `owner_${Math.floor(100000000 + Math.random() * 900000000)}`;
const regionIds: number[] = [];
const cityIds: number[] = [];
const submissionIds: number[] = [];

async function listen(serverToStart: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    serverToStart.once("error", reject);
    serverToStart.listen(0, "127.0.0.1", () => resolve());
  });
  const address = serverToStart.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function createLocation() {
  const suffix = randomUUID();
  const [region] = await db
    .insert(serviceRegionsCatalogTable)
    .values({ name: `منطقة اختبار ${suffix}` })
    .returning();
  const [city] = await db
    .insert(serviceCitiesCatalogTable)
    .values({ name: `مدينة اختبار ${suffix}`, regionId: region.id })
    .returning();
  regionIds.push(region.id);
  cityIds.push(city.id);
  return { region, city };
}

function submissionBody(
  serviceRegionId: number,
  serviceCityId: number,
  city: string,
) {
  return {
    businessName: `مزود اختبار ${randomUUID()}`,
    category: "test",
    serviceRegionId,
    serviceCityId,
    city,
    whatsappNumber: "0500000000",
    galleryPhotos: ["/test/1.jpg", "/test/2.jpg", "/test/3.jpg"],
    pricingUnit: "per_request",
    dailyCapacity: 1,
    requiresInsurance: false,
    insuranceAmount: null,
    coverageTags: [city],
    customFeatureTags: [],
  };
}

async function request(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; json: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${sessionId}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  return { response, json: await response.json() };
}

before(async () => {
  sessionId = await createSession({
    user: {
      id: ownerId,
      email: null,
      firstName: null,
      lastName: null,
      profileImageUrl: null,
    },
    access_token: "integration-test",
  });
  server = createServer(app);
  baseUrl = await listen(server);
});

after(async () => {
  if (submissionIds.length > 0) {
    await db
      .delete(serviceProviderSubmissionsTable)
      .where(inArray(serviceProviderSubmissionsTable.id, submissionIds));
  }
  if (cityIds.length > 0) {
    await db
      .delete(serviceCitiesCatalogTable)
      .where(inArray(serviceCitiesCatalogTable.id, cityIds));
  }
  if (regionIds.length > 0) {
    await db
      .delete(serviceRegionsCatalogTable)
      .where(inArray(serviceRegionsCatalogTable.id, regionIds));
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sessionId));

  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
});

describe("service provider location availability", () => {
  for (const disabledLevel of ["region", "city"] as const) {
    it(`hides a disabled ${disabledLevel} from the provider form and rejects saved or direct submissions`, async () => {
      const { region, city } = await createLocation();
      const initial = await request("/api/providers/submit", {
        method: "POST",
        body: JSON.stringify(submissionBody(region.id, city.id, city.name)),
      });
      assert.equal(initial.response.status, 201);
      submissionIds.push(initial.json.id);

      const reopened = await request(`/api/providers/my/submissions/${initial.json.id}`);
      assert.equal(reopened.response.status, 200);
      assert.equal(reopened.json.serviceRegionId, region.id);
      assert.equal(reopened.json.serviceCityId, city.id);

      if (disabledLevel === "region") {
        await db
          .update(serviceRegionsCatalogTable)
          .set({ isActive: false })
          .where(eq(serviceRegionsCatalogTable.id, region.id));
      } else {
        await db
          .update(serviceCitiesCatalogTable)
          .set({ isActive: false })
          .where(eq(serviceCitiesCatalogTable.id, city.id));
      }

      const regions = await request("/api/service-regions");
      assert.equal(regions.response.status, 200);
      assert.equal(
        regions.json.some((item: { id: number }) => item.id === region.id),
        disabledLevel !== "region",
      );

      const cities = await request(`/api/service-cities?regionId=${region.id}`);
      assert.equal(cities.response.status, 200);
      assert.equal(
        cities.json.some((item: { id: number }) => item.id === city.id),
        false,
      );

      const direct = await request("/api/providers/submit", {
        method: "POST",
        body: JSON.stringify(submissionBody(region.id, city.id, city.name)),
      });
      assert.equal(direct.response.status, 422);
      assert.equal(direct.json.error, "المنطقة أو المدينة غير مفعلة");

      const saved = await request(`/api/providers/my/submissions/${initial.json.id}`, {
        method: "PATCH",
        body: JSON.stringify({}),
      });
      assert.equal(saved.response.status, 422);
      assert.equal(saved.json.error, "يرجى اختيار منطقة ومدينة مفعلتين");
    });
  }
});