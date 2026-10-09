import { db } from "@workspace/db";
import { chaletSubmissionsTable, chaletsTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import { normalizeCustomerPhone } from "./customerPhone";

/** Both preflight and submission use the same rules; never return matching owners' data. */
export async function checkPropertyIdentity(data: {
  nameAr: string;
  location: string;
  district: string;
  whatsappNumber: string;
}) {
  const name = data.nameAr.trim();
  const city = data.location.trim();
  const district = data.district.trim();
  const phone = normalizeCustomerPhone(data.whatsappNumber).replace(/^0/, "");
  const phoneSql = (column: typeof chaletSubmissionsTable.whatsappNumber | typeof chaletsTable.whatsappNumber) =>
    sql`regexp_replace(regexp_replace(translate(coalesce(${column}, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^(00966|966|0)', '')`;
  const result = await db.execute<{
    nameConflict: boolean;
    whatsappConflict: boolean;
    similarName: boolean;
  }>(sql`
    WITH matching_names AS (
      SELECT ${chaletSubmissionsTable.district} AS district
      FROM ${chaletSubmissionsTable}
      WHERE lower(trim(${chaletSubmissionsTable.nameAr})) = lower(${name})
        AND lower(trim(${chaletSubmissionsTable.location})) = lower(${city})
        AND ${chaletSubmissionsTable.status} <> 'rejected'
      UNION ALL
      SELECT ${chaletsTable.district} AS district FROM ${chaletsTable}
      WHERE lower(trim(${chaletsTable.nameAr})) = lower(${name})
        AND lower(trim(${chaletsTable.location})) = lower(${city})
    )
    SELECT
      EXISTS(SELECT 1 FROM matching_names WHERE lower(trim(coalesce(district, ''))) = lower(${district})) AS "nameConflict",
      EXISTS(SELECT 1 FROM matching_names WHERE lower(trim(coalesce(district, ''))) <> lower(${district})) AS "similarName",
      (EXISTS(SELECT 1 FROM ${chaletSubmissionsTable}
        WHERE ${phoneSql(chaletSubmissionsTable.whatsappNumber)} = ${phone}
          AND ${chaletSubmissionsTable.status} <> 'rejected')
       OR EXISTS(SELECT 1 FROM ${chaletsTable}
        WHERE ${phoneSql(chaletsTable.whatsappNumber)} = ${phone})) AS "whatsappConflict"
  `);
  return result.rows[0];
}
