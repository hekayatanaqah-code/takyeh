import { db, photographyPackagesTable, ownerServicesTable, citiesCatalogTable, regionsCatalogTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import type { PhotographyTarget } from "./photography-targets";

type Store = Pick<typeof db, "select">;
export function supportsPackage(
  p: { approvedPackageIds: number[]; approvedSpecialties: string[] },
  pkg: { id: number; propertyTypes: string[]; specialties: string[] }, targetType?: string | null,
) {
  return p.approvedPackageIds.includes(pkg.id)
    && (!pkg.propertyTypes.length || (!!targetType && pkg.propertyTypes.includes(targetType)))
    && (!pkg.specialties.length || pkg.specialties.some(s => p.approvedSpecialties.includes(s)));
}
export async function packageEligible(p: Parameters<typeof supportsPackage>[0], packageId: number, targetType?: string | null, store: Store = db, allowInactive = false) {
  const [pkg] = await store.select().from(photographyPackagesTable).where(eq(photographyPackagesTable.id, packageId));
  return !!pkg && (pkg.active || allowInactive) && supportsPackage(p, pkg, targetType);
}
export async function photographyCityCovered(target: PhotographyTarget, store: Store = db) {
  const [card] = await store.select().from(ownerServicesTable).where(and(eq(ownerServicesTable.kind, "photography"), isNull(ownerServicesTable.deletedAt)));
  if (!card?.coverageCityIds.length) return false;
  const cities = await store.select({ id: citiesCatalogTable.id, name: citiesCatalogTable.name, region: regionsCatalogTable.name })
    .from(citiesCatalogTable).innerJoin(regionsCatalogTable, eq(citiesCatalogTable.regionId, regionsCatalogTable.id))
    .where(and(eq(citiesCatalogTable.isActive, true), eq(regionsCatalogTable.isActive, true)));
  return cities.some(c => card.coverageCityIds.includes(c.id) && c.name === target.location && c.region === target.region);
}
