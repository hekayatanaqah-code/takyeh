import { randomUUID } from "node:crypto";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { MySqlDialect, MySqlTable, type AnyMySqlColumn, type MySqlTransactionConfig } from "drizzle-orm/mysql-core";
import { getTableColumns, getTableName, is, sql, TransactionRollbackError, type SQLWrapper } from "drizzle-orm";
import type { FieldPacket, Pool } from "mysql2/promise";
import { rawResultCodecs, type RawResultCodec } from "../raw-result-codecs";
import { isMariaDbTransactionDatabase, registerMariaDbContextAlias, withMariaDbTransaction } from "./transaction";

type NativeDatabase = MySql2Database<Record<string, unknown>>;
export type NativeRawResult<Row extends Record<string, unknown>> = { rows: Row[]; rowCount: number };
export type NativeApplicationDatabase = Omit<NativeDatabase, "execute" | "transaction"> & {
  execute<Row extends Record<string, unknown> = Record<string, unknown>>(query: SQLWrapper | string): Promise<NativeRawResult<Row>>;
  transaction<T>(work: (tx: NativeApplicationTransaction) => Promise<T>, options?: MySqlTransactionConfig): Promise<T>;
};
export type NativeApplicationTransaction = NativeApplicationDatabase & { rollback(): never };

function booleanValue(value: unknown): boolean {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  throw new Error("Invalid MariaDB boolean result.");
}
function dateValue(value: unknown): Date {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Invalid MariaDB date result.");
    return value;
  }
  if (typeof value !== "string") throw new Error("Invalid MariaDB date result.");
  const utc = /^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)
    ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(utc);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid MariaDB date result.");
  return date;
}
function decode(value: unknown, codec: RawResultCodec): unknown {
  if (value === null) return null;
  if (codec === "boolean") return booleanValue(value);
  if (codec === "date") return dateValue(value);
  if (codec === "json") return typeof value === "string" ? JSON.parse(value)
    : Buffer.isBuffer(value) ? JSON.parse(value.toString("utf8")) : value;
  if (typeof value !== "number" && (typeof value !== "string" || !/^[+-]?\d+$/.test(value))) {
    throw new Error("Invalid MariaDB integer result.");
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Unsafe MariaDB integer result.");
  return number;
}

/**
 * Normalizes mysql2's result envelope and known column codecs only.
 * SQL, table bindings and query builders remain genuinely native MySQL.
 * It never translates PostgreSQL SQL, fabricates rows, or retries writes.
 */
export function createMariaDbApplicationDriver(pool: Pool, schema: Record<string, unknown>): NativeApplicationDatabase {
  const models = new Map<string, Record<string, AnyMySqlColumn>>();
  for (const table of Object.values(schema)) {
    if (!is(table, MySqlTable)) continue;
    const columns = getTableColumns(table);
    models.set(getTableName(table), Object.fromEntries(Object.values(columns).map(column => [column.name, column])));
  }
  const dialect = new MySqlDialect();
  function frameResult(result: unknown, query: SQLWrapper | string): NativeRawResult<Record<string, unknown>> {
    if (!Array.isArray(result) || result.length !== 2) throw new Error("Invalid mysql2 result envelope.");
    const [data, fields] = result;
    if (!Array.isArray(data)) {
      if (!data || typeof data !== "object" || !("affectedRows" in data) ||
          typeof data.affectedRows !== "number" || !Number.isSafeInteger(data.affectedRows)) {
        throw new Error("Missing mysql2 mutation outcome.");
      }
      return { rows: [], rowCount: data.affectedRows };
    }
    if (!Array.isArray(fields)) throw new Error("Missing mysql2 field metadata.");
    const codecs = rawResultCodecs(query);
    const rows = data.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Invalid mysql2 row.");
      const row: Record<string, unknown> = { ...item };
      for (const field of fields as FieldPacket[]) {
        const type = field.columnType;
        const flags: unknown = field.flags;
        if (typeof type !== "number" || typeof flags !== "number") throw new Error("Invalid mysql2 field type metadata.");
        const value = row[field.name];
        if (value === null) continue;
        const explicit = codecs.get(field.name);
        const column = models.get(field.orgTable)?.[field.orgName];
        if (explicit) row[field.name] = decode(value, explicit);
        else if (column?.dataType === "json") row[field.name] = decode(value, "json");
        else if (column?.dataType === "boolean" || type === 1) {
          row[field.name] = booleanValue(value);
        } else if (type === 10) {
          row[field.name] = value instanceof Date ? value.toISOString().slice(0, 10) : value;
        } else if ([7, 12].includes(type)) row[field.name] = dateValue(value);
        // Preserve BIGINT/DECIMAL strings. Integer expressions must declare
        // their result alias explicitly; metadata cannot distinguish COUNT
        // from a signed integer cast reliably across MariaDB versions.
      }
      return row;
    });
    return { rows, rowCount: rows.length };
  }
  function facade(database: NativeDatabase, transactionOnly = false): NativeApplicationTransaction {
    const execute = async <Row extends Record<string, unknown>>(query: SQLWrapper | string): Promise<NativeRawResult<Row>> => {
      const text = typeof query === "string" ? query : dialect.sqlToQuery(query.getSQL()).sql;
      const plain = text.replace(/^\s*(?:(?:\/\*[\s\S]*?\*\/|--[^\n]*(?:\n|$))\s*)*/, "").trim();
      if (/^(?:CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE|USE|BEGIN|COMMIT|START|SET|LOCK|UNLOCK)\b/i.test(plain) ||
          (/^ROLLBACK\b/i.test(plain) && !/^ROLLBACK\s+TO\s+SAVEPOINT\b/i.test(plain)) ||
          /\/\*(?:!|M!)/i.test(text)) {
        throw new Error("Application SQL cannot change schema or control managed transactions.");
      }
      const result: unknown = await database.execute(query);
      // The caller's generic is the same explicit raw-query contract as the
      // legacy driver; runtime column decoding above remains checked.
      return frameResult(result, query) as NativeRawResult<Row>;
    };
    let wrapped: NativeApplicationTransaction;
    const transaction = async <T>(work: (tx: NativeApplicationTransaction) => Promise<T>, config?: MySqlTransactionConfig): Promise<T> => {
      if (config?.accessMode || config?.withConsistentSnapshot) {
        throw new Error("Unsupported application transaction configuration.");
      }
      if (isMariaDbTransactionDatabase(database)) {
        if (config?.isolationLevel) throw new Error("Cannot change isolation within a transaction.");
        const point = sql.identifier(`nested_${randomUUID().replaceAll("-", "")}`);
        await database.execute(sql`SAVEPOINT ${point}`);
        try {
          return await work(wrapped);
        } catch (error) {
          await database.execute(sql`ROLLBACK TO SAVEPOINT ${point}`);
          throw error;
        } finally {
          await database.execute(sql`RELEASE SAVEPOINT ${point}`);
        }
      }
      return withMariaDbTransaction(pool, [], tx => work(facade(tx.db, true)), config);
    };
    const proxy = new Proxy(database, {
      get(target, key) {
        if (transactionOnly && !isMariaDbTransactionDatabase(target)) throw new Error("Transaction context is closed.");
        if (key === "execute") return execute;
        if (key === "transaction") return transaction;
        if (key === "rollback") return () => { throw new TransactionRollbackError(); };
        const value: unknown = Reflect.get(target, key, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    // Native instance identity is retained by the proxy; only these documented
    // result/transaction methods differ from the mysql2 Drizzle surface.
    const changedSurface: unknown = proxy;
    wrapped = changedSurface as NativeApplicationTransaction;
    registerMariaDbContextAlias(wrapped, database);
    return wrapped;
  }
  return facade(drizzle(pool, { mode: "default" }));
}
