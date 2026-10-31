import type { RevenuePeriod } from "./revenuePeriod";

export type RevenueFilterMode = "monthly" | "yearly" | "custom" | "all";

export function revenueFilterPeriod(mode: RevenueFilterMode, calendar: RevenuePeriod["calendar"],
  year: string, month: string, from: string, to: string): RevenuePeriod {
  if (mode === "custom") return { calendar, year: "", month: "", range: { from, to } };
  if (mode === "all") return { calendar, year: "", month: "" };
  return { calendar, year, month: mode === "monthly" ? month : "" };
}
