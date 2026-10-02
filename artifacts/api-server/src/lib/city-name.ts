import { sql, type SQL } from "drizzle-orm";

const IGNORED_CITY_CHARACTERS = "[\\s\u064B-\u065F\u0670\u200B-\u200F\uFEFF]";

/** Exact city identity after spelling normalization, never a substring search. */
export function normalizeCityName(value: string): string {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[ٱى]/g, character => character === "ٱ" ? "ا" : "ي")
    .replace(/[ـء]/g, "")
    .replace(new RegExp(IGNORED_CITY_CHARACTERS, "g"), "");
}

export function normalizedCityExpression(value: SQL): SQL {
  return sql`LOWER(REGEXP_REPLACE(
    TRANSLATE(NORMALIZE(COALESCE(${value}, ''), NFKD), 'ٱىـء', 'اي'),
    ${IGNORED_CITY_CHARACTERS}, '', 'g'
  ))`;
}

export function cityNameMatches(value: SQL, city: string): SQL {
  return sql`${normalizedCityExpression(value)} = ${normalizeCityName(city)}`;
}