import { sql, type SQL } from "drizzle-orm";

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function normalizeCustomerPhone(value: string): string {
  let digits = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(PERSIAN_DIGITS.indexOf(digit)))
    .replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("966") && digits.length === 12) digits = `0${digits.slice(3)}`;
  if (digits.length === 9 && digits.startsWith("5")) digits = `0${digits}`;

  return digits;
}

/** Same identity normalization for historical records, without rewriting snapshots. */
export function customerPhoneSql(value: SQL): SQL {
  return sql`(SELECT CASE
    WHEN digits ~ '^9665[0-9]{8}$' THEN '0' || substring(digits FROM 4)
    WHEN digits ~ '^5[0-9]{8}$' THEN '0' || digits ELSE digits END
    FROM (SELECT regexp_replace(regexp_replace(translate(coalesce(${value}, ''),
      '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'), '[^0-9]', '', 'g'), '^00', '') AS digits) phone)`;
}