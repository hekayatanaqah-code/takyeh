import {
  db, chaletSubmissionsTable, chaletsTable, serviceProviderSubmissionsTable,
  serviceProvidersTable, serviceCitiesCatalogTable, serviceRegionsCatalogTable,
  photographersTable, citiesCatalogTable, regionsCatalogTable, districtsCatalogTable,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

type Store = Pick<typeof db, "select">;
export type PhotographyTargetInput = { propertyId?: number; serviceSubmissionId?: number };
export interface PhotographyTarget {
  id: number; kind: "property" | "service"; nameAr: string; ownerId: string;
  location: string; region: string | null; district: string | null; whatsappNumber: string;
}
export const photographyTargetFields = {
  propertyId: z.number().int().positive().optional(),
  serviceSubmissionId: z.number().int().positive().optional(),
};
export const exactlyOnePhotographyTarget = (v: PhotographyTargetInput) =>
  (v.propertyId !== undefined) !== (v.serviceSubmissionId !== undefined);
export const photographyReservationSchema = z.object({
  ...photographyTargetFields,
  photographerId: z.number().int().positive(),
  packageId: z.number().int().positive(),
  startAt: z.string().datetime({ offset: true }),
}).strict().refine(exactlyOnePhotographyTarget, "اختر عقاراً أو خدمة واحدة للتصوير");

export async function photographyActivities(ownerIds: string[], store: Store = db, input: PhotographyTargetInput = {}, lock = false) {
  const propertyQuery = store.select({
    id: chaletSubmissionsTable.id, nameAr: chaletSubmissionsTable.nameAr,
    ownerId: chaletSubmissionsTable.ownerId, location: chaletSubmissionsTable.location,
    region: chaletSubmissionsTable.region, district: chaletSubmissionsTable.district,
    whatsappNumber: chaletSubmissionsTable.whatsappNumber,
  }).from(chaletSubmissionsTable).innerJoin(chaletsTable, eq(chaletsTable.submissionId, chaletSubmissionsTable.id))
    .where(and(inArray(chaletSubmissionsTable.ownerId, ownerIds),
      eq(chaletSubmissionsTable.status, "approved"), eq(chaletsTable.isActive, true),
      input.propertyId !== undefined ? eq(chaletSubmissionsTable.id, input.propertyId) : undefined));
  const serviceQuery = store.select({
    id: serviceProviderSubmissionsTable.id, nameAr: serviceProviderSubmissionsTable.businessName,
    ownerId: serviceProviderSubmissionsTable.ownerId, location: serviceCitiesCatalogTable.name,
    region: serviceRegionsCatalogTable.name, whatsappNumber: serviceProviderSubmissionsTable.whatsappNumber,
  }).from(serviceProviderSubmissionsTable)
    .innerJoin(serviceProvidersTable, eq(serviceProvidersTable.submissionId, serviceProviderSubmissionsTable.id))
    .innerJoin(serviceCitiesCatalogTable, eq(serviceCitiesCatalogTable.id, serviceProviderSubmissionsTable.serviceCityId))
    .innerJoin(serviceRegionsCatalogTable, and(
      eq(serviceRegionsCatalogTable.id, serviceProviderSubmissionsTable.serviceRegionId),
      eq(serviceCitiesCatalogTable.regionId, serviceRegionsCatalogTable.id)))
    .where(and(inArray(serviceProviderSubmissionsTable.ownerId, ownerIds),
      eq(serviceProviderSubmissionsTable.status, "approved"), eq(serviceProvidersTable.isActive, true),
      eq(serviceCitiesCatalogTable.isActive, true), eq(serviceRegionsCatalogTable.isActive, true),
      input.serviceSubmissionId !== undefined ? eq(serviceProviderSubmissionsTable.id, input.serviceSubmissionId) : undefined));
  const properties = input.serviceSubmissionId !== undefined ? []
    : lock ? await propertyQuery.for("share") : await propertyQuery;
  const services = input.propertyId !== undefined ? []
    : lock ? await serviceQuery.for("share") : await serviceQuery;
  return {
    properties: properties.map(p => ({ ...p, kind: "property" as const })),
    services: services.map(s => ({ ...s, kind: "service" as const, district: null })),
  };
}
export async function ownedPhotographyTarget(ownerIds: string[], input: PhotographyTargetInput, store: Store = db, lock = false): Promise<PhotographyTarget | null> {
  if (!exactlyOnePhotographyTarget(input)) return null;
  const catalog = await photographyActivities(ownerIds, store, input, lock);
  const target = input.propertyId !== undefined
    ? catalog.properties.find(p => p.id === input.propertyId)
    : catalog.services.find(s => s.id === input.serviceSubmissionId);
  return target?.ownerId ? { ...target, ownerId: target.ownerId } : null;
}
export async function coveredPhotographyTarget(target: PhotographyTarget, p: typeof photographersTable.$inferSelect) {
  if (p.status !== "approved" || !p.cityId || !p.regionId) return false;
  const [city] = await db.select().from(citiesCatalogTable).where(eq(citiesCatalogTable.id, p.cityId));
  const [region] = await db.select().from(regionsCatalogTable).where(eq(regionsCatalogTable.id, p.regionId));
  if (!city?.isActive || !region?.isActive || city.regionId !== region.id
    || city.name !== target.location || region.name !== target.region) return false;
  // Services have no district field. Only citywide photographers can cover
  // them: never silently broaden a photographer's district-only coverage.
  if (target.kind === "service") return p.allDistricts;
  if (p.allDistricts) return true;
  const districts = p.districtIds.length ? await db.select().from(districtsCatalogTable)
    .where(and(eq(districtsCatalogTable.cityId, city.id), inArray(districtsCatalogTable.id, p.districtIds))) : [];
  return districts.some(d => d.isActive && d.name === target.district);
}
