export type LegacyHoldingKind = "custody" | "withheld" | "emergency" | "deposit";
export type HoldingGroup = "custody" | "withheld";

/** Preserve legacy rows; their two custody directions must never be netted together. */
export function holdingGroup(kind: LegacyHoldingKind): HoldingGroup {
  return kind === "custody" || kind === "emergency" ? "custody" : "withheld";
}

export function holdingGroupTotals(records: readonly { kind: LegacyHoldingKind; status: string; amount: string }[]) {
  const totals = {
    custody: { cents: 0, count: 0 },
    withheld: { cents: 0, count: 0 },
  };
  for (const record of records) {
    if (record.status !== "open") continue;
    const group = totals[holdingGroup(record.kind)];
    group.cents += Math.round(Number(record.amount) * 100);
    group.count += 1;
  }
  return {
    custody: { open: totals.custody.cents / 100, count: totals.custody.count },
    withheld: { open: totals.withheld.cents / 100, count: totals.withheld.count },
  };
}
