import { normalizeCityName } from "./city-name";
import type { InventoryFilterState, FilterOption } from "../components/admin/InventoryFilters";

export interface InventoryDescriptor {
  id: number; name: string; city: string; region: string; category: string;
  status: string; pricing: string; createdAt: string;
  categoryIsIdentifier?: boolean;
  ownerName?: string | null;
}
export const emptyInventoryFilters = (): InventoryFilterState => ({
  search: "", regions: [], cities: [], categories: [], statuses: [], pricing: [], sort: "newest",
});
export const propertyPricingOptions: FilterOption[] = [
  { value: "daily", label: "حسب أيام الأسبوع" },
  { value: "weekday_weekend", label: "وسط الأسبوع ونهايته" },
  { value: "period", label: "حسب فترة الحجز" },
  { value: "per_night", label: "بالليلة" },
  { value: "unpriced", label: "غير محدد" },
];
export const servicePricingOptions: FilterOption[] = [
  { value: "per_day", label: "باليوم" }, { value: "per_hour", label: "بالساعة" },
  { value: "per_request", label: "بالطلب" }, { value: "agreement", label: "حسب الاتفاق" },
];
export function propertyPricingMode(row: {
  dailyPrices?: Record<string, Record<string, number>> | null;
  priceWeekday?: string | null; priceWeekend?: string | null;
  priceMorning?: string | null; priceEvening?: string | null;
  priceFullDay?: string | null; pricePerNight?: string | null;
}): string {
  if (Object.values(row.dailyPrices ?? {}).some(prices => Object.values(prices ?? {}).some(price => Number(price) > 0))) return "daily";
  if ([row.priceWeekday, row.priceWeekend].some(price => Number(price) > 0)) return "weekday_weekend";
  if ([row.priceMorning, row.priceEvening, row.priceFullDay].some(price => Number(price) > 0)) return "period";
  return Number(row.pricePerNight) > 0 ? "per_night" : "unpriced";
}
export function uniqueFilterOptions(options: FilterOption[], exactValues = false): FilterOption[] {
  const seen = new Set<string>();
  return options.filter(option => {
    const key = exactValues ? option.value : normalizeCityName(option.value);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  }).sort((a, b) => a.label.localeCompare(b.label, "ar"));
}
export function filterAndSortInventory<T>(
  rows: T[], filters: InventoryFilterState, describe: (row: T) => InventoryDescriptor,
  pricingEnabled = true,
): T[] {
  const selected = (values: string[]) => new Set(values.map(normalizeCityName));
  const regions = selected(filters.regions), cities = selected(filters.cities);
  const categories = selected(filters.categories), statuses = selected(filters.statuses), pricing = selected(pricingEnabled ? filters.pricing : []);
  const categoryIdentifiers = new Set(filters.categories);
  const query = normalizeCityName(filters.search);
  const matches = (values: Set<string>, value: string) => values.size === 0 || values.has(normalizeCityName(value));
  const filtered = rows.map(row => ({ row, data: describe(row) })).filter(({ data }) =>
    matches(regions, data.region) && matches(cities, data.city)
    && (data.categoryIsIdentifier
      ? categoryIdentifiers.size === 0 || categoryIdentifiers.has(data.category)
      : matches(categories, data.category))
    && matches(statuses, data.status) && matches(pricing, data.pricing)
    && (!query || normalizeCityName([data.name, data.ownerName ?? "", data.city, data.region, data.category, data.id].join(" ")).includes(query)),
  );
  return filtered.sort((a, b) => {
    let comparison = 0;
    if (filters.sort === "name") comparison = a.data.name.localeCompare(b.data.name, "ar");
    else if (filters.sort === "status") comparison = a.data.status.localeCompare(b.data.status);
    else if (filters.sort === "pricing" && pricingEnabled) comparison = a.data.pricing.localeCompare(b.data.pricing);
    else {
      const time = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
      comparison = (time(a.data.createdAt) - time(b.data.createdAt)) * (filters.sort === "oldest" ? 1 : -1);
    }
    return comparison || a.data.id - b.data.id;
  }).map(item => item.row);
}