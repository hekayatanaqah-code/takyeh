import { sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db";
import { customerPhoneSql } from "../customerPhone";

export function crmSearch(value: string) {
  return value.trim().replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/^#\s*/, "");
}
export function countValue(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) {
    throw new Error("Invalid CRM count.");
  }
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid CRM count.");
  return count;
}
export function moneyValue(value: unknown): number {
  if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+(?:\.\d+)?$/.test(value))) {
    throw new Error("Invalid CRM amount.");
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || Math.abs(amount) > Number.MAX_SAFE_INTEGER) throw new Error("Invalid CRM amount.");
  return amount;
}
export function booleanValue(value: unknown): boolean | null {
  if (value === null) return null;
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  throw new Error("Invalid CRM boolean.");
}
export async function authorizedProvider(ownerId: string, providerId?: number) {
  if (!providerId) return true;
  return (await db.execute(sql`SELECT id FROM service_providers
    WHERE id=${providerId} AND owner_id=${ownerId} LIMIT 1`)).rows.length > 0;
}
/** Preserve the pinned UTC departure; malformed legacy dates stay active. */
export function checkoutSql(): SQL {
  const first = sql`CONCAT(LEFT(b.booking_date, 7), '-01')`;
  const valid = sql`b.booking_date REGEXP '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
    AND LEFT(b.booking_date,4) <> '0000'
    AND CAST(RIGHT(b.booking_date,2) AS UNSIGNED) <= DAY(LAST_DAY(${first}))`;
  return sql`COALESCE(b.checkout_at, CASE WHEN ${valid} THEN COALESCE(
    DATE_SUB(DATE_ADD(STR_TO_DATE(${first}, '%Y-%m-%d'),
      INTERVAL (CAST(RIGHT(b.booking_date,2) AS UNSIGNED)-1+GREATEST(1,COALESCE(b.duration_days,1))) DAY),
      INTERVAL 3 HOUR), '9999-12-31 23:59:59.999')
    ELSE '9999-12-31 23:59:59.999' END)`;
}
export function crmRecords(ownerId: string, phone: string, providerId?: number, now = new Date()): SQL {
  if (providerId) {
    const today = now.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
    return sql`SELECT b.id, b.client_name, b.client_id_number, b.date_str AS booking_date,
      NULL AS duration_days, b.duration AS period, CAST(COALESCE(b.amount,0) AS CHAR) AS total_price,
      p.business_name AS chalet_name, b.cancelled_at,
      (b.cancelled_at IS NOT NULL OR b.status IN ('cancelled','canceled')) AS cancelled,
      b.contract_signed, CAST(b.insurance_amount AS CHAR) AS insurance_fee,
      (COALESCE(b.insurance_amount,0)>0) AS insurance_received,
      (b.insurance_status='refunded') AS insurance_refunded,
      CAST(b.insurance_deduct_amount AS CHAR) AS insurance_deducted,
      b.previous_date_str AS original_date, b.last_edited_at AS rescheduled_at,
      (b.cancelled_at IS NULL AND b.status NOT IN ('cancelled','canceled','completed')
        AND b.date_str>=${today}) AS is_active
      FROM service_appointments b JOIN service_providers p ON p.id=b.provider_id
      WHERE b.owner_id=${ownerId} AND p.owner_id=${ownerId} AND b.provider_id=${providerId}
        AND ${customerPhoneSql(sql`b.client_phone`)}=${phone}
      UNION ALL
      SELECT b.id,b.client_name,NULL,CAST(b.date_str AS CHAR),NULL,'quick_sale',
        CAST(b.total AS CHAR),b.provider_name,b.cancelled_at,(b.status='cancelled'),
        false,NULL,false,false,NULL,NULL,NULL,false
      FROM quick_sales b WHERE b.owner_id=${ownerId} AND b.provider_id=${providerId} AND b.client_phone=${phone}`;
  }
  return sql`SELECT b.id,b.client_name,b.contract_signer_id AS client_id_number,
    b.booking_date,b.duration_days,b.period,CAST(COALESCE(b.total_price,0) AS CHAR) AS total_price,
    s.name_ar AS chalet_name,b.cancelled_at,(b.cancelled_at IS NOT NULL) AS cancelled,
    b.contract_signed,CAST(b.insurance_fee AS CHAR) AS insurance_fee,b.insurance_received,b.insurance_refunded,
    CAST(b.insurance_deducted AS CHAR) AS insurance_deducted,NULL AS original_date,NULL AS rescheduled_at,
    (b.cancelled_at IS NULL AND ${now}<${checkoutSql()}) AS is_active
    FROM owner_bookings b LEFT JOIN chalet_submissions s ON s.id=b.submission_id
    WHERE b.owner_id=${ownerId} AND ${customerPhoneSql(sql`b.client_phone`)}=${phone}`;
}
export function normalizeRecord(row: Record<string, unknown>) {
  const output = { ...row };
  for (const key of ["cancelled", "contract_signed", "insurance_received", "insurance_refunded", "is_active"]) {
    output[key] = booleanValue(row[key]);
  }
  return output;
}
