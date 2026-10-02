/** Keep city identity exact while ignoring hamza, diacritics and whitespace. */
export function normalizeCityName(value: string): string {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[ٱى]/g, character => character === "ٱ" ? "ا" : "ي")
    .replace(/[ـء]/g, "")
    .replace(/[\s\u064B-\u065F\u0670\u200B-\u200F\uFEFF]/g, "");
}

export function sameCityName(first: string, second: string): boolean {
  const normalized = normalizeCityName(first);
  return !!normalized && normalized === normalizeCityName(second);
}