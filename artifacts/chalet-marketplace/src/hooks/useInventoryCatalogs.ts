import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { normalizeCityName } from "@/lib/city-name";
import { uniqueFilterOptions, type InventoryDescriptor } from "@/lib/inventory-filters";
import type { InventoryFilterState } from "@/components/admin/InventoryFilters";

interface Region { id: number; name: string }
interface City { id: number; name: string; regionId: number | null }
interface Category { id: number; nameAr?: string; key?: string; labelAr?: string; isActive: boolean }
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function loadCatalog<T>(path: string): Promise<T[]> {
  const response = await fetch(`${BASE}/api/admin/${path}`, { credentials: "include" });
  if (!response.ok) throw new Error("تعذر تحميل دليل التصنيفات والمواقع");
  return response.json();
}

export function useInventoryCatalogs(kind: "properties" | "services") {
  const prefix = kind === "services" ? "service-" : "";
  const regionsQuery = useQuery<Region[]>({ queryKey: ["admin", `${prefix}regions`], queryFn: () => loadCatalog(`${prefix}regions`) });
  const citiesQuery = useQuery<City[]>({ queryKey: ["admin", `${prefix}cities`], queryFn: () => loadCatalog(`${prefix}cities`) });
  const categoriesQuery = useQuery<Category[]>({ queryKey: ["admin", `${prefix}categories`], queryFn: () => loadCatalog(`${prefix}categories`) });
  const regions = regionsQuery.data ?? [], cities = citiesQuery.data ?? [], categories = categoriesQuery.data ?? [];
  const regionNames = useMemo(() => new Map(regions.map(region => [region.id, region.name])), [regions]);
  const cityRegion = (name: string): string => {
    const matches = cities.filter(city => normalizeCityName(city.name) === normalizeCityName(name));
    return matches.length === 1 ? regionNames.get(matches[0].regionId ?? -1) ?? "" : "";
  };
  return {
    regions, cities, categories, cityRegion,
    isError: regionsQuery.isError || citiesQuery.isError || categoriesQuery.isError,
    refetch: () => { void regionsQuery.refetch(); void citiesQuery.refetch(); void categoriesQuery.refetch(); },
    options: (rows: InventoryDescriptor[], filters: InventoryFilterState) => {
      const selectedRegions = new Set(filters.regions.map(normalizeCityName));
      const inRegion = (name: string) => !selectedRegions.size || selectedRegions.has(normalizeCityName(name));
      const usedCategories = new Set(rows.map(row => row.category));
      const categoryOptions = categories.filter(category =>
        kind !== "services" || (category.key !== "other" && category.labelAr?.trim() !== "أخرى")
        || usedCategories.has(category.key ?? ""),
      ).map(category => ({
        value: kind === "services" ? category.key ?? "" : category.nameAr ?? "",
        label: `${category.labelAr ?? category.nameAr ?? category.key}${category.isActive ? "" : " (غير مفعّل)"}`,
      }));
      return {
        regions: uniqueFilterOptions([...regions.map(region => ({ value: region.name, label: region.name })), ...rows.map(row => ({ value: row.region, label: row.region }))]),
        cities: uniqueFilterOptions([
          ...cities.filter(city => inRegion(regionNames.get(city.regionId ?? -1) ?? "")).map(city => ({ value: city.name, label: city.name })),
          ...rows.filter(row => inRegion(row.region)).map(row => ({ value: row.city, label: row.city })),
        ]),
        categories: uniqueFilterOptions([...categoryOptions, ...rows.map(row => ({ value: row.category, label: categoryOptions.find(option => option.value === row.category)?.label ?? row.category }))], kind === "services"),
      };
    },
    reconcile: (current: InventoryFilterState, next: InventoryFilterState, rows: InventoryDescriptor[]): InventoryFilterState => {
      if (current.regions.join("\0") === next.regions.join("\0") || next.regions.length === 0) return next;
      const selectedRegions = new Set(next.regions.map(normalizeCityName));
      const allowed = new Set([
        ...cities.filter(city => selectedRegions.has(normalizeCityName(regionNames.get(city.regionId ?? -1) ?? ""))).map(city => normalizeCityName(city.name)),
        ...rows.filter(row => selectedRegions.has(normalizeCityName(row.region))).map(row => normalizeCityName(row.city)),
      ]);
      return { ...next, cities: next.cities.filter(city => allowed.has(normalizeCityName(city))) };
    },
  };
}