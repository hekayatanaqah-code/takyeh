import { formatDualDate } from "./hijri";

/** Settlement is a stored calendar day, not an instant to shift between zones. */
export function formatHoldingSettlementDate(value: string | null): string {
  const { hijri, gregorian } = formatDualDate(value?.slice(0, 10) ?? "");
  return hijri && gregorian ? `${hijri} (${gregorian} م)` : "—";
}
