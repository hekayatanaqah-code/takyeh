import { db } from "@workspace/db";
import { chaletSubmissionsTable, chaletsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { normalizeCustomerPhone } from "./customerPhone";
import { sqlDigits,sqlRegexReplace,sqlDistinct,sqlText } from "@workspace/db/sql-expressions";
import { withRawResultCodecs } from "@workspace/db/raw-result-codecs";

/** Both preflight and submission use the same rules; never return matching owners' data. */
export async function checkPropertyIdentity(data: {
  nameAr: string;
  location: string;
  district: string;
  whatsappNumber: string;
}, excludeSubmissionId?: number) {
  const name = data.nameAr.trim();
  const city = data.location.trim();
  const district = data.district.trim();
  const phone = normalizeCustomerPhone(data.whatsappNumber).replace(/^0/, "");
  const phoneSql = (column: typeof chaletSubmissionsTable.whatsappNumber | typeof chaletsTable.whatsappNumber) =>
    sqlRegexReplace(sqlRegexReplace(sqlDigits(sql`coalesce(${column},'')`),"[^0-9]","",true),"^(00966|966|0)","");
  const result = await db.execute<{
    nameConflict: boolean;
    whatsappConflict: boolean;
    similarName: boolean;
  }>(withRawResultCodecs(sql`
    WITH matching_names AS (
      SELECT ${chaletSubmissionsTable.district} AS district
      FROM ${chaletSubmissionsTable}
      WHERE lower(trim(${chaletSubmissionsTable.nameAr})) = lower(${name})
        AND lower(trim(${chaletSubmissionsTable.location})) = lower(${city})
        AND ${sqlText(chaletSubmissionsTable.status)} NOT IN ('rejected', 'cancelled')
        AND ${sqlDistinct(chaletSubmissionsTable.id,sql`${excludeSubmissionId ?? null}`)}
      UNION ALL
      SELECT ${chaletsTable.district} AS district FROM ${chaletsTable}
      WHERE lower(trim(${chaletsTable.nameAr})) = lower(${name})
        AND lower(trim(${chaletsTable.location})) = lower(${city})
        AND (${sqlText(sql`${excludeSubmissionId ?? null}`)} IS NULL OR ${sqlDistinct(chaletsTable.submissionId,sql`${excludeSubmissionId ?? null}`)})
    )
    SELECT
      EXISTS(SELECT 1 FROM matching_names WHERE lower(trim(coalesce(district, ''))) = lower(${district})) AS "nameConflict",
      EXISTS(SELECT 1 FROM matching_names WHERE lower(trim(coalesce(district, ''))) <> lower(${district})) AS "similarName",
      (EXISTS(SELECT 1 FROM ${chaletSubmissionsTable}
        WHERE ${phoneSql(chaletSubmissionsTable.whatsappNumber)} = ${phone}
          AND ${sqlText(chaletSubmissionsTable.status)} NOT IN ('rejected', 'cancelled')
          AND ${sqlDistinct(chaletSubmissionsTable.id,sql`${excludeSubmissionId ?? null}`)})
       OR EXISTS(SELECT 1 FROM ${chaletsTable}
        WHERE ${phoneSql(chaletsTable.whatsappNumber)} = ${phone}
          AND (${sqlText(sql`${excludeSubmissionId ?? null}`)} IS NULL OR ${sqlDistinct(chaletsTable.submissionId,sql`${excludeSubmissionId ?? null}`)}))) AS "whatsappConflict"
  `,{nameConflict:"boolean",whatsappConflict:"boolean",similarName:"boolean"}));
  return result.rows[0];
}
