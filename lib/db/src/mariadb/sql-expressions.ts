import { sql, type SQL, type SQLWrapper } from "drizzle-orm";
import { withRawResultCodecs } from "../raw-result-codecs";
export function sqlText(value: SQLWrapper): SQL<string> { return sql<string>`CAST(${value} AS CHAR)`; }
export function sqlCurrentSchema(): SQL<string> { return sql<string>`DATABASE()`; }
export function sqlExactText(value: SQLWrapper): SQL<string> {
  return sql<string>`CAST(${value} AS BINARY)`.mapWith(value=>{
    if (typeof value==="string") return value;
    if (Buffer.isBuffer(value)) return value.toString("utf8");
    throw new Error("Invalid binary text projection.");
  });
}
export function sqlBoolean(value: SQLWrapper,alias?: string): SQL<boolean> {
  const expression = sql<boolean>`${value}`.mapWith(value=>{
    if (value===true || value===1 || value==="1") return true;
    if (value===false || value===0 || value==="0") return false;
    throw new Error("Invalid boolean projection.");
  });
  return alias ? withRawResultCodecs(expression,{[alias]:"boolean"}) : expression;
}
export function sqlArrayFallback(value: SQLWrapper,single: SQLWrapper,alias: string): SQL {
  return withRawResultCodecs(sql`CASE WHEN JSON_LENGTH(${value})>0 THEN ${value}
    WHEN ${single} IS NOT NULL THEN JSON_ARRAY(${single}) ELSE JSON_ARRAY() END`,{[alias]:"json"});
}
export function sqlEmptyTextArray(alias: string): SQL { return withRawResultCodecs(sql`JSON_ARRAY()`,{[alias]:"json"}); }
export const sqlEmptyJsonArray = sqlEmptyTextArray;
export function sqlSupportMessages(ticketId: SQLWrapper): SQL {
  const item = sql`JSON_OBJECT(
    'id',m.id,'author_role',m.author_role,'body',m.body,
    'attachment_urls',JSON_EXTRACT(m.attachment_urls,'$'),
    'created_at',DATE_FORMAT(m.created_at,'%Y-%m-%dT%H:%i:%s.%fZ'))`;
  const aggregate = sql`JSON_ARRAYAGG(${item} ORDER BY m.id)`;
  // MariaDB limits JSON_ARRAYAGG by group_concat_max_len. Verify the complete
  // compact byte length, rather than exposing truncated or invented empty data.
  return withRawResultCodecs(sql`(SELECT CASE WHEN COUNT(*)=0 THEN JSON_ARRAY()
    WHEN JSON_VALID(${aggregate})
      AND OCTET_LENGTH(JSON_COMPACT(${aggregate}))=2+SUM(OCTET_LENGTH(JSON_COMPACT(${item})))+COUNT(*)-1
    THEN ${aggregate}
    ELSE (SELECT incomplete_messages FROM (SELECT 1 AS incomplete_messages UNION ALL SELECT 2) invalid_messages) END
    FROM owner_support_messages m WHERE m.ticket_id=${ticketId})`,{messages:"json"});
}
export function sqlRemainingDays(value: SQLWrapper): SQL<number> {
  return sql<number>`GREATEST(0,CEIL(TIMESTAMPDIFF(MICROSECOND,UTC_TIMESTAMP(6),${value})/86400000000))`;
}
export function sqlConcat(...values: SQLWrapper[]): SQL<string> { return sql<string>`CONCAT(${sql.join(values,sql`, `)})`; }
export function sqlOwnerId(value: SQLWrapper): SQL<string> { return sqlConcat(sql`'owner_'`,sqlText(value)); }
export function sqlRegex(value: SQLWrapper,pattern: string): SQL<boolean> {
  return sql<boolean>`(CAST(${value} AS BINARY) REGEXP ${pattern})`;
}
export function sqlDistinct(left: SQLWrapper,right: SQLWrapper): SQL<boolean> { return sql<boolean>`NOT(${left}<=>${right})`; }
function jsonPath(key: string) {
  if (!/^[a-zA-Z_][a-zA-Z_0-9]*$/.test(key)) throw new Error("Invalid SQL JSON key.");
  return `$.${key}`;
}
export function sqlJsonValue(value: SQLWrapper,key: string): SQL { return sql`JSON_EXTRACT(${value},${jsonPath(key)})`; }
export function sqlJsonText(value: SQLWrapper,key: string): SQL<string> {
  const item = sqlJsonValue(value,key);
  return sql<string>`CASE WHEN JSON_TYPE(${item})='NULL' THEN NULL ELSE JSON_UNQUOTE(${item}) END`;
}
export function sqlDigits(value: SQLWrapper): SQL<string> {
  let expression = sql<string>`${value}`;
  for (const alphabet of ["٠١٢٣٤٥٦٧٨٩","۰۱۲۳۴۵۶۷۸۹"]) {
    for (let index=0;index<10;index++) expression = sql<string>`REPLACE(${expression},${alphabet[index]},${String(index)})`;
  }
  return expression;
}
export function sqlRegexReplace(value: SQLWrapper,pattern: string,replacement: string,global=false): SQL<string> {
  // All non-global callers deliberately remove an anchored prefix/suffix.
  // Reject unsupported first-only replacements instead of silently replacing all.
  if (!global && !pattern.startsWith("^") && !pattern.endsWith("$")) {
    throw new Error("Unanchored first-only regex replacement needs an explicit implementation.");
  }
  return sql<string>`REGEXP_REPLACE(${value},${pattern},${replacement})`;
}
export function sqlInteger(value: SQLWrapper,alias?: string): SQL<number> {
  const expression = sql<number>`CASE WHEN ${value} IS NULL THEN NULL
    WHEN TRIM(CAST(${value} AS CHAR)) REGEXP '^[+-]?[0-9]+$'
      AND CAST(${value} AS DECIMAL(65,0)) BETWEEN -2147483648 AND 2147483647
    THEN CAST(${value} AS SIGNED)
    ELSE (SELECT invalid_integer FROM (SELECT 1 AS invalid_integer UNION ALL SELECT 2) invalid_projection) END`
    .mapWith(value => {
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number < -2147483648 || number > 2147483647) throw new Error("Invalid integer projection.");
      return number;
    });
  return alias ? withRawResultCodecs(expression,{[alias]:"integer"}) : expression;
}
export function sqlInsensitiveLike(value: SQLWrapper,pattern: string): SQL<boolean> {
  return sql<boolean>`LOWER(${value}) LIKE LOWER(${pattern})`;
}
export function sqlCustomerPhone(value: SQLWrapper): SQL<string> {
  const digits = sqlRegexReplace(sqlRegexReplace(sqlDigits(sql`COALESCE(${value},'')`),'[^0-9]','',true),'^00','');
  return sql<string>`CASE WHEN ${sqlRegex(digits,"^9665[0-9]{8}$")} THEN CONCAT('0',SUBSTRING(${digits},4))
    WHEN ${sqlRegex(digits,"^5[0-9]{8}$")} THEN CONCAT('0',${digits}) ELSE ${digits} END`;
}
export function addSqlDays(value: SQL, days: number | undefined): SQL<Date> {
  if (typeof days !== "number" || !Number.isSafeInteger(days)) throw new Error("Date duration must be an integer.");
  return sql<Date>`DATE_ADD(${value}, INTERVAL ${days} DAY)`;
}
export function addSqlMinutes(value: SQL, minutes: number): SQL<Date> {
  if (!Number.isSafeInteger(minutes)) throw new Error("Date duration must be an integer.");
  return sql<Date>`DATE_ADD(${value}, INTERVAL ${minutes} MINUTE)`;
}
