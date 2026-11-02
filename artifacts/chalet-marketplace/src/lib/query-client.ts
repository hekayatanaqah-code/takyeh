import { QueryClient, type QueryKey } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0, gcTime: 0, refetchOnMount: true,
      refetchOnWindowFocus: true, retry: 1,
    },
  },
});

// Public settings can change in another admin tab. Always refresh when their
// screen opens or regains focus, even if a consumer specifies a stale time.
for (const key of ["page-content", "siteSettings"]) {
  queryClient.setQueryDefaults([key], {
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

export const CATALOG_NAMES = [
  "categories", "service-categories", "regions", "cities", "districts",
  "service-regions", "service-cities", "amenities",
];
for (const name of CATALOG_NAMES) {
  for (const prefix of [["catalog", name], ["admin", name], [name]]) {
    queryClient.setQueryDefaults(prefix, {
      refetchInterval: 30_000, refetchOnMount: "always", refetchOnWindowFocus: "always",
    });
  }
}
queryClient.setQueryDefaults(["providers", "search-options"], {
  refetchInterval: 30_000, refetchOnMount: "always", refetchOnWindowFocus: "always",
});

export function isCatalogQuery(key: QueryKey): boolean {
  return key[0] === "catalog" || CATALOG_NAMES.includes(String(key[0]))
    || (key[0] === "admin" && CATALOG_NAMES.includes(String(key[1])))
    || (key[0] === "providers" && key[1] === "search-options");
}

export function refreshCatalogsAfterWrite(path: string): void {
  if (!/^\/(?:categories|service-categories|regions|cities|districts|service-regions|service-cities|amenities)(?:\/|$)/.test(path)
    && !/^\/(?:submissions|service-submissions)\/\d+\/status$/.test(path)) return;
  void queryClient.invalidateQueries({ predicate: query => isCatalogQuery(query.queryKey) });
}