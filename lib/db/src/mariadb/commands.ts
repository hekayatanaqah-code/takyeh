import { randomUUID } from "node:crypto";
import { and, eq, getTableColumns, getTableName, is, SQL, sql, type InferSelectModel } from "drizzle-orm";
import { MySqlDialect, getTableConfig, type AnyMySqlColumn, type MySqlTable, type MySqlInsertValue, type MySqlUpdateSetSource } from "drizzle-orm/mysql-core";
import { MySql2Database, MySql2Transaction } from "drizzle-orm/mysql2";
import { lockResource, lockResourceDigests, resourceLockDigest, type TransactionExecutor } from "../transaction-lock";
import type { Projected, WriteResult } from "../mutation-results";
import { deleteAndRead, insertAndRead, mutationIdentity, updateAndRead, type NativeMutationDatabase } from "./mutations";
import { isMariaDbTransactionDatabase } from "./transaction";

type Selection = Record<string, AnyMySqlColumn | SQL | SQL.Aliased>;
type Conflict<T extends MySqlTable> =
  | { action: "ignore"; target?: AnyMySqlColumn | AnyMySqlColumn[]; where?: SQL }
  | { action: "update"; target: AnyMySqlColumn | AnyMySqlColumn[]; set: MySqlUpdateSetSource<T>; where?: SQL; targetWhere?: SQL; setWhere?: SQL };
type Options<T extends MySqlTable> = { conflict?: Conflict<T> };
type NativeStore = NativeMutationDatabase & TransactionExecutor;

async function inTransaction<T>(store: TransactionExecutor, work: (tx: NativeStore) => Promise<T>): Promise<T> {
  const atomic = async (tx: NativeStore): Promise<T> => {
    const point = sql.identifier(`command_${randomUUID().replaceAll("-", "")}`);
    await tx.execute(sql`SAVEPOINT ${point}`);
    try {
      return await work(tx);
    } catch (error) {
      await tx.execute(sql`ROLLBACK TO SAVEPOINT ${point}`);
      throw error;
    } finally {
      await tx.execute(sql`RELEASE SAVEPOINT ${point}`);
    }
  };
  if (is(store, MySql2Transaction)) return atomic(store);
  if (!is(store, MySql2Database)) throw new Error("MariaDB commands require a mysql2 Drizzle context.");
  if (isMariaDbTransactionDatabase(store)) return atomic(store);
  return store.transaction(tx => work(tx), { isolationLevel: "read committed" });
}
function duplicate(error: unknown): boolean {
  let current = error;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    if ("errno" in current && current.errno === 1062) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}
function explicitIdentity<T extends MySqlTable>(table: T, input: MySqlInsertValue<T>): MySqlInsertValue<T> {
  const row: Record<string, unknown> = { ...input };
  const primary = new Set(getTableConfig(table).primaryKeys.flatMap(key => key.columns));
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if ((column.primary || primary.has(column)) && row[key] == null && column.dataType === "string" && is(column.default, SQL)) {
      const { sql: expression, params } = new MySqlDialect().sqlToQuery(column.default);
      if (!params.length && /^\(*uuid\(\)\)*$/i.test(expression.replace(/\s+/g, ""))) row[key] = randomUUID();
    }
  }
  // Only a recognized UUID string primary key is supplied above. All original
  // payload types remain checked by the public generic function signature.
  return row as MySqlInsertValue<T>;
}
async function insertOne<T extends MySqlTable>(
  tx: NativeStore, table: T, input: MySqlInsertValue<T>, options?: Options<T> & { returning?: Selection },
): Promise<unknown[]> {
  const context = { db: tx };
  const values = explicitIdentity(table, input);
  const identityValues: Record<string, unknown> = { ...values };
  const conflict = options?.conflict;
  const columns = getTableColumns(table);
  const primary = new Set([
    ...Object.values(columns).filter(column => column.primary),
    ...getTableConfig(table).primaryKeys.flatMap(key => key.columns),
  ]);
  const target = conflict?.target ? (Array.isArray(conflict.target) ? conflict.target : [conflict.target]) : [];
  const identities = target.map(column => {
    const key = Object.keys(columns).find(key => columns[key] === column);
    if (!key) throw new Error("Conflict target does not belong to the mutation table.");
    const value = identityValues[key];
    if (is(value, SQL)) throw new Error("Conflict keys must be explicit values, not SQL expressions.");
    return { column, value };
  });
  const complete = identities.length > 0 && identities.every(item => item.value !== undefined && item.value !== null);
  const targetWhere = conflict?.action === "update" ? conflict.targetWhere : conflict?.where;
  const predicate = complete ? and(...identities.map(item => eq(item.column, item.value)), targetWhere)! : undefined;
  if (predicate) {
    await lockResource(tx, "mutation-unique", getTableName(table),
      JSON.stringify(identities.map(item => [item.column.name, item.value])));
  }
  const existingRows = async () => predicate ? tx.select().from(table).where(predicate).for("update") : [];
  const replace = async (before: Record<string, unknown>[]): Promise<unknown[]> => {
    if (before.length !== 1) throw new Error("Conflict target must identify exactly one row.");
    if (conflict?.action !== "update") return [];
    const where = and(mutationIdentity(table, before), conflict.setWhere ?? conflict.where)!;
    const changes: Record<string, unknown> = { ...conflict.set };
    for (const [key, column] of Object.entries(columns)) {
      if (primary.has(column) && key in changes) {
        if (changes[key] !== before[0][key] && changes[key] !== column) {
          throw new Error("Conflict update cannot change the primary key.");
        }
        delete changes[key];
      }
    }
    if (!Object.keys(changes).length) {
      const entry = Object.entries(columns).find(([, column]) => !primary.has(column));
      if (!entry) return tx.select(options?.returning ?? columns).from(table).where(where);
      const [key, column] = entry;
      changes[key] = column.onUpdateFn ? column.onUpdateFn() : sql`${column}`;
    }
    // Removing only proven-unchanged primary-key assignments preserves the
    // public, table-typed payload; no arbitrary extra values are admitted.
    const set = changes as MySqlUpdateSetSource<T>;
    return options?.returning
      ? updateAndRead(context, table, set, where, options.returning)
      : updateAndRead(context, table, set, where);
  };
  const before = await existingRows();
  if (before.length) return replace(before);
  const point = sql.identifier(`insert_${randomUUID().replaceAll("-", "")}`);
  await tx.execute(sql`SAVEPOINT ${point}`);
  try {
    const row = await insertAndRead(context, table, values);
    return options?.returning
      ? await tx.select(options.returning).from(table).where(mutationIdentity(table, [row]))
      : [row];
  } catch (error) {
    await tx.execute(sql`ROLLBACK TO SAVEPOINT ${point}`);
    if (!conflict || !duplicate(error)) throw error;
    // Target-specific conflicts must NEVER swallow a collision on another
    // unique key. No INSERT IGNORE or blanket ON DUPLICATE KEY UPDATE.
    if (target.length) {
      const matched = await existingRows();
      if (!matched.length) throw error;
      return replace(matched);
    }
    if (conflict.action === "ignore") return [];
    throw error;
  } finally {
    await tx.execute(sql`RELEASE SAVEPOINT ${point}`);
  }
}
export function insertRecords<T extends MySqlTable>(store: TransactionExecutor, table: T, values: MySqlInsertValue<T> | MySqlInsertValue<T>[], options?: Options<T>): Promise<InferSelectModel<T>[]>;
export function insertRecords<T extends MySqlTable, P extends Selection>(store: TransactionExecutor, table: T, values: MySqlInsertValue<T> | MySqlInsertValue<T>[], options: Options<T> & { returning: P }): Promise<Projected<P>[]>;
export async function insertRecords<T extends MySqlTable>(store: TransactionExecutor, table: T, values: MySqlInsertValue<T> | MySqlInsertValue<T>[], options?: Options<T> & { returning?: Selection }): Promise<unknown[]> {
  const inputs = Array.isArray(values) ? values : [values];
  if (!inputs.length) throw new Error("Cannot insert an empty values list.");
  return inTransaction(store, async tx => {
    const prepared = inputs.map(input => explicitIdentity(table,input));
    const target = options?.conflict?.target;
    if (target) {
      const columns = getTableColumns(table);
      const targets = Array.isArray(target) ? target : [target];
      const stripes = new Map<number,Buffer>();
      for (const input of prepared) {
        const values: Record<string,unknown> = {...input};
        const identities = targets.map(column => {
          const key = Object.keys(columns).find(key=>columns[key]===column);
          if (!key) throw new Error("Conflict target does not belong to the mutation table.");
          const value = values[key];
          if (is(value,SQL)) throw new Error("Conflict keys must be explicit values, not SQL expressions.");
          return {column,value};
        });
        if (identities.every(item=>item.value!==undefined && item.value!==null)) {
          const digest = resourceLockDigest("mutation-unique",getTableName(table),
            JSON.stringify(identities.map(item=>[item.column.name,item.value])));
          stripes.set(digest.readUInt16BE(0)>>>4,digest);
        }
      }
      // Acquire the complete batch in global order before touching any row.
      // Opposite input orders must not create a cycle of unique-key row locks.
      const ordered = [...stripes].sort(([a],[b])=>a-b).map(([,digest])=>digest);
      for (let index=0;index<ordered.length;index+=128) {
        await lockResourceDigests(tx,ordered.slice(index,index+128));
      }
    }
    const rows: unknown[] = [];
    for (const input of prepared) rows.push(...await insertOne(tx, table, input, options));
    return rows;
  });
}
export async function writeRecords<T extends MySqlTable>(store: TransactionExecutor, table: T, values: MySqlInsertValue<T> | MySqlInsertValue<T>[], options?: Options<T>): Promise<WriteResult<InferSelectModel<T>>> {
  const rows = await insertRecords(store, table, values, options);
  return { rows, rowCount: rows.length };
}
export function updateRecords<T extends MySqlTable>(store: TransactionExecutor, table: T, values: MySqlUpdateSetSource<T>, where?: SQL): Promise<InferSelectModel<T>[]>;
export function updateRecords<T extends MySqlTable, P extends Selection>(store: TransactionExecutor, table: T, values: MySqlUpdateSetSource<T>, where: SQL | undefined, returning: P): Promise<Projected<P>[]>;
export async function updateRecords<T extends MySqlTable>(store: TransactionExecutor, table: T, values: MySqlUpdateSetSource<T>, where?: SQL, returning?: Selection): Promise<unknown[]> {
  return inTransaction<unknown[]>(store, tx => returning
    ? updateAndRead({ db: tx }, table, values, where ?? sql`TRUE`, returning)
    : updateAndRead({ db: tx }, table, values, where ?? sql`TRUE`));
}
export function deleteRecords<T extends MySqlTable>(store: TransactionExecutor, table: T, where?: SQL): Promise<InferSelectModel<T>[]>;
export function deleteRecords<T extends MySqlTable, P extends Selection>(store: TransactionExecutor, table: T, where: SQL | undefined, returning: P): Promise<Projected<P>[]>;
export async function deleteRecords<T extends MySqlTable>(store: TransactionExecutor, table: T, where?: SQL, returning?: Selection): Promise<unknown[]> {
  return inTransaction(store, async tx => {
    if (!returning) return deleteAndRead({ db: tx }, table, where ?? sql`TRUE`);
    const before = await tx.select().from(table).where(where ?? sql`TRUE`).for("update");
    if (!before.length) return [];
    const predicate = mutationIdentity(table, before);
    const rows = await tx.select(returning).from(table).where(predicate);
    await tx.delete(table).where(predicate);
    return rows;
  });
}
