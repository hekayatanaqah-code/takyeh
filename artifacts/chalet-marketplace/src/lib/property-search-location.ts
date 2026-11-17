/** Keep the original city objects so district queries retain their catalog IDs. */
export function getRegionCities<T extends { regionId: number | null }>(cities: T[], regionId: string): T[] {
  return regionId ? cities.filter((city) => city.regionId != null && String(city.regionId) === regionId) : [];
}
