import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface GlobalSeason {
  id: number;
  nameAr: string;
  startDate: string;
  endDate: string;
  color: string;
  isActive?: boolean;
}

/**
 * Active seasons used by customer-facing calendars.
 *
 * Passing a submission/property id lets the API omit seasons disabled for
 * that property; leaving it out returns the global season calendar.
 */
export function useGlobalSeasons(submissionId?: number) {
  return useQuery<GlobalSeason[]>({
    queryKey: ["global-seasons", submissionId ?? null],
    queryFn: async () => {
      const query = submissionId != null
        ? `?submissionId=${encodeURIComponent(String(submissionId))}`
        : "";
      const response = await fetch(`${BASE}/api/chalets/global-seasons${query}`, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`تعذر تحميل مواسم الحجز (${response.status})`);
      }
      const seasons = await response.json();
      if (!Array.isArray(seasons)) {
        throw new Error("استجابة مواسم الحجز غير صالحة");
      }
      return seasons as GlobalSeason[];
    },
    staleTime: 5 * 60 * 1000,
  });
}