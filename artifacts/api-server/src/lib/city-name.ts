import { sql, type SQL } from "drizzle-orm";
import { db,chaletsTable } from "@workspace/db";
import { sqlExactText } from "@workspace/db/sql-expressions";

const IGNORED_CITY_CHARACTERS = "[\\s\u064B-\u065F\u0670\u200B-\u200F\uFEFF]";

/** Exact city identity after spelling normalization, never a substring search. */
export function normalizeCityName(value: string): string {
  return value.normalize("NFKD").toLowerCase()
    .replace(/[ٱى]/g, character => character === "ٱ" ? "ا" : "ي")
    .replace(/[ـء]/g, "")
    .replace(new RegExp(IGNORED_CITY_CHARACTERS, "g"), "");
}

export async function cityNameMatches(value: SQL, city: string): Promise<SQL> {
  // MariaDB has no Unicode NFKD equivalent. Normalize the bounded distinct
  // city-name vocabulary in JS, then keep property filtering inside the DB.
  // Binary text prevents an accent-insensitive collation merging distinct names.
  const rows = await db.selectDistinct({location:sqlExactText(chaletsTable.location)}).from(chaletsTable);
  const identity = normalizeCityName(city);
  const variants = rows.filter(row=>typeof row.location==="string" && normalizeCityName(row.location)===identity)
    .map(row=>row.location);
  return variants.length ? sql`${sqlExactText(value)} IN (${sql.join(variants.map(name=>sql`${name}`),sql`, `)})`
    : sql`FALSE`;
}