import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
export function sqlText(value: SQLWrapper): SQL<string> { return sql<string>`${value}::text`; }
export function sqlCurrentSchema(): SQL<string> { return sql<string>`current_schema()`; }
export function sqlExactText(value: SQLWrapper): SQL<string> { return sql<string>`${value}`; }
export function sqlBoolean(value: SQLWrapper,_alias?: string): SQL<boolean> { return sql<boolean>`${value}`; }
export function sqlArrayFallback(value: SQLWrapper,single: SQLWrapper,_alias: string): SQL {
  return sql`CASE WHEN array_length(${value},1)>0 THEN ${value}
    WHEN ${single} IS NOT NULL THEN ARRAY[${single}] ELSE '{}'::text[] END`;
}
export function sqlEmptyTextArray(_alias: string): SQL { return sql`'{}'::text[]`; }
export function sqlEmptyJsonArray(_alias: string): SQL { return sql`'[]'::jsonb`; }
export function sqlSupportMessages(ticketId: SQLWrapper): SQL {
  return sql`COALESCE((SELECT jsonb_agg(jsonb_build_object(
    'id',m.id,'author_role',m.author_role,'body',m.body,'attachment_urls',m.attachment_urls,'created_at',m.created_at)
    ORDER BY m.id) FROM owner_support_messages m WHERE m.ticket_id=${ticketId}),'[]'::jsonb)`;
}
export function sqlRemainingDays(value: SQLWrapper): SQL<number> {
  return sql<number>`GREATEST(0,CEIL(EXTRACT(EPOCH FROM (${value}-NOW()))/86400))::int`;
}
export function sqlConcat(...values: SQLWrapper[]): SQL<string> { return sql<string>`(${sql.join(values,sql` || `)})`; }
export function sqlOwnerId(value: SQLWrapper): SQL<string> { return sqlConcat(sql`'owner_'`,sqlText(value)); }
export function sqlRegex(value: SQLWrapper, pattern: string): SQL<boolean> { return sql<boolean>`${value} ~ ${pattern}`; }
export function sqlDistinct(left: SQLWrapper, right: SQLWrapper): SQL<boolean> { return sql<boolean>`${left} IS DISTINCT FROM ${right}`; }
export function sqlJsonValue(value: SQLWrapper,key: string): SQL { return sql`${value}->${key}`; }
export function sqlJsonText(value: SQLWrapper,key: string): SQL<string> { return sql<string>`${value}->>${key}`; }
export function sqlDigits(value: SQLWrapper): SQL<string> {
  return sql<string>`translate(${value},'٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789')`;
}
export function sqlRegexReplace(value: SQLWrapper,pattern: string,replacement: string,global=false): SQL<string> {
  return global ? sql<string>`regexp_replace(${value},${pattern},${replacement},'g')`
    : sql<string>`regexp_replace(${value},${pattern},${replacement})`;
}
export function sqlInteger(value: SQLWrapper,_alias?: string): SQL<number> {
  return sql<number>`${value}::integer`.mapWith(Number);
}
export function sqlInsensitiveLike(value: SQLWrapper,pattern: string): SQL<boolean> {
  return sql<boolean>`${value} ILIKE ${pattern}`;
}
export function sqlCustomerPhone(value: SQLWrapper): SQL<string> {
  const digits = sqlRegexReplace(sqlRegexReplace(sqlDigits(sql`COALESCE(${value},'')`),'[^0-9]','',true),'^00','');
  return sql<string>`(SELECT CASE WHEN digits ~ '^9665[0-9]{8}$' THEN '0'||substring(digits FROM 4)
    WHEN digits ~ '^5[0-9]{8}$' THEN '0'||digits ELSE digits END FROM (SELECT ${digits} AS digits) phone)`;
}
export function addSqlDays(value: SQL, days: number | undefined): SQL<Date> {
  if (typeof days !== "number" || !Number.isSafeInteger(days)) throw new Error("Date duration must be an integer.");
  return sql<Date>`${value} + (${days} * INTERVAL '1 day')`;
}
export function addSqlMinutes(value: SQL, minutes: number): SQL<Date> {
  if (!Number.isSafeInteger(minutes)) throw new Error("Date duration must be an integer.");
  return sql<Date>`${value} + (${minutes} * INTERVAL '1 minute')`;
}
