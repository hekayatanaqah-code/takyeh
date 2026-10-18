/** The liquidity card and its dialog describe the same outstanding cash, not monthly income. */
export function cashBreakdownTotal(rows: readonly { amount: number }[]): number {
  return rows.reduce((cents, row) => cents + Math.round(row.amount * 100), 0) / 100;
}
