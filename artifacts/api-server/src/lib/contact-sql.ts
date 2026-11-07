import { sql,type SQLWrapper } from "drizzle-orm";
import { sqlDigits,sqlRegexReplace } from "@workspace/db/sql-expressions";
export function nationalPhoneSql(value: SQLWrapper,replacement="") {
  return sqlRegexReplace(sqlRegexReplace(sqlDigits(sql`COALESCE(${value},'')`),"[^0-9]","",true),
    "^(00966|966|0)",replacement);
}
