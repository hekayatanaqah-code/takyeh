import { db } from "@workspace/db";
import { serviceCityRequestsTable as requests, serviceCitiesCatalogTable as cities, serviceRegionsCatalogTable as regions, type ServiceCityRequest } from "@workspace/db/schema";
import { and, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { normalizeCityName, normalizedCityExpression } from "./city-name";

export class CityRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function cityRequestRecord(row: ServiceCityRequest & { regionName?: string | null }) {
  return {
    id: row.id, city: row.city, regionId: row.regionId, regionName: row.regionName ?? null,
    requesterName: row.requesterName, status: row.status, reason: row.reason,
    createdAt: row.createdAt.toISOString(), reviewedAt: row.reviewedAt?.toISOString() ?? null,
    approvedCityId: row.approvedCityId,
  };
}

// Serialize request submissions and reviews, including two approvals for the same city.
const catalogLock = sql`SELECT pg_advisory_xact_lock(hashtext('service-city-request-catalog'))`;

export async function createCityRequest(input: { city: string; regionId?: number }, requesterId: string, requesterName: string, database: Pick<typeof db, "transaction"> = db) {
  return database.transaction(async tx => {
    await tx.execute(catalogLock);
    let regionName: string | null = null;
    if (input.regionId) {
      const [region] = await tx.select().from(regions).where(and(eq(regions.id, input.regionId), eq(regions.isActive, true)));
      if (!region) throw new CityRequestError(400, "يرجى اختيار منطقة خدمات مفعّلة");
      regionName = region.name;
    }
    const identity = normalizeCityName(input.city);
    if (identity.length < 2) throw new CityRequestError(400, "يرجى إدخال اسم مدينة صحيح");
    const [existingCity] = await tx.select({ id: cities.id }).from(cities).where(and(
      eq(normalizedCityExpression(sql`${cities.name}`), identity),
      eq(cities.isActive, true), input.regionId ? eq(cities.regionId, input.regionId) : undefined,
    ));
    if (existingCity) throw new CityRequestError(409, "هذه المدينة موجودة بالفعل في قائمة مدن الخدمات");
    const [pending] = await tx.select().from(requests).where(and(
      eq(requests.requesterId, requesterId), eq(requests.status, "pending"),
      eq(normalizedCityExpression(sql`${requests.city}`), identity),
      input.regionId ? eq(requests.regionId, input.regionId) : isNull(requests.regionId),
    ));
    if (pending) return cityRequestRecord({ ...pending, regionName });
    const [saved] = await tx.insert(requests).values({
      city: input.city.trim(), regionId: input.regionId ?? null, requesterId,
      requesterName: requesterName.trim() || "مقدم خدمة",
    }).returning();
    return cityRequestRecord({ ...saved, regionName });
  });
}

export async function listCityRequests() {
  const rows = await db.select({ ...getTableColumns(requests), regionName: regions.name })
    .from(requests).leftJoin(regions, eq(regions.id, requests.regionId))
    .orderBy(desc(requests.createdAt), desc(requests.id));
  return rows.map(cityRequestRecord);
}

export async function reviewCityRequest(id: number, input: { decision: "approve" | "reject"; regionId?: number; reason?: string }, actorId: string, database: Pick<typeof db, "transaction"> = db) {
  return database.transaction(async tx => {
    await tx.execute(catalogLock);
    const [request] = await tx.select().from(requests).where(eq(requests.id, id)).for("update");
    if (!request) throw new CityRequestError(404, "طلب المدينة غير موجود");
    if (request.status !== "pending") throw new CityRequestError(409, "تمت مراجعة هذا الطلب مسبقاً؛ يرجى تحديث القائمة");
    let approvedCityId: number | null = null;
    let regionId = request.regionId;
    let regionName: string | null = null;
    if (input.decision === "approve") {
      regionId = input.regionId ?? regionId;
      if (!regionId) throw new CityRequestError(400, "اختر المنطقة التابعة للمدينة قبل الموافقة");
      const [region] = await tx.select().from(regions).where(and(eq(regions.id, regionId), eq(regions.isActive, true)));
      if (!region) throw new CityRequestError(400, "المنطقة غير موجودة أو غير مفعّلة");
      regionName = region.name;
      const [existing] = await tx.select().from(cities).where(and(
        eq(cities.regionId, regionId),
        eq(normalizedCityExpression(sql`${cities.name}`), normalizeCityName(request.city)),
      ));
      if (existing) {
        approvedCityId = existing.id;
        if (!existing.isActive) await tx.update(cities).set({ isActive: true }).where(eq(cities.id, existing.id));
      } else {
        const [added] = await tx.insert(cities).values({ name: request.city, regionId, isActive: true }).returning({ id: cities.id });
        approvedCityId = added.id;
      }
    }
    if (regionId && !regionName) {
      const [region] = await tx.select({ name: regions.name }).from(regions).where(eq(regions.id, regionId));
      regionName = region?.name ?? null;
    }
    const [updated] = await tx.update(requests).set({
      status: input.decision === "approve" ? "approved" : "rejected", regionId,
      reason: input.reason?.trim() || null, reviewedBy: actorId, reviewedAt: new Date(), approvedCityId,
    }).where(eq(requests.id, id)).returning();
    return cityRequestRecord({ ...updated, regionName });
  });
}
