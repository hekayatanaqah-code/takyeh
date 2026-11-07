import type { InferSelectModel, SQL } from "drizzle-orm";
import { is } from "drizzle-orm";
import {
  PgDatabase, type PgColumn, type PgInsertValue, type PgTable,
  type PgUpdateSetSource,
} from "drizzle-orm/pg-core";
import type { TransactionExecutor } from "./transaction-lock";
import type { Projected, WriteResult } from "./mutation-results";

type Selection = Record<string, PgColumn | SQL | SQL.Aliased>;
type Conflict<T extends PgTable> =
  | { action: "ignore"; target?: PgColumn | PgColumn[]; where?: SQL }
  | { action: "update"; target: PgColumn | PgColumn[]; set: PgUpdateSetSource<T>; where?: SQL; targetWhere?: SQL; setWhere?: SQL };
type Options<T extends PgTable> = { conflict?: Conflict<T> };
function database(store: TransactionExecutor) {
  if (!is(store, PgDatabase)) throw new Error("PostgreSQL development mutations received a different driver.");
  return store;
}

// These adapters keep the original development database usable during the
// migration. The MariaDB build resolves the same API to native commands instead.
export function insertRecords<T extends PgTable>(store: TransactionExecutor, table: T, values: PgInsertValue<T> | PgInsertValue<T>[], options?: Options<T>): Promise<InferSelectModel<T>[]>;
export function insertRecords<T extends PgTable, P extends Selection>(store: TransactionExecutor, table: T, values: PgInsertValue<T> | PgInsertValue<T>[], options: Options<T> & { returning: P }): Promise<Projected<P>[]>;
export async function insertRecords<T extends PgTable>(store: TransactionExecutor, table: T, values: PgInsertValue<T> | PgInsertValue<T>[], options?: Options<T> & { returning?: Selection }): Promise<unknown[]> {
  const command = database(store).insert(table).values(Array.isArray(values) ? values : [values]);
  const conflict = options?.conflict;
  if (conflict?.action === "ignore") {
    const { action: _, ...config } = conflict;
    const query = command.onConflictDoNothing(config);
    return options?.returning ? query.returning(options.returning) : query.returning();
  }
  if (conflict?.action === "update") {
    const { action: _, ...config } = conflict;
    const query = command.onConflictDoUpdate(config);
    return options?.returning ? query.returning(options.returning) : query.returning();
  }
  return options?.returning ? command.returning(options.returning) : command.returning();
}
export async function writeRecords<T extends PgTable>(store: TransactionExecutor, table: T, values: PgInsertValue<T> | PgInsertValue<T>[], options?: Options<T>): Promise<WriteResult<InferSelectModel<T>>> {
  const rows = await insertRecords(store, table, values, options);
  return { rows, rowCount: rows.length };
}
export function updateRecords<T extends PgTable>(store: TransactionExecutor, table: T, values: PgUpdateSetSource<T>, where?: SQL): Promise<InferSelectModel<T>[]>;
export function updateRecords<T extends PgTable, P extends Selection>(store: TransactionExecutor, table: T, values: PgUpdateSetSource<T>, where: SQL | undefined, returning: P): Promise<Projected<P>[]>;
export async function updateRecords<T extends PgTable>(store: TransactionExecutor, table: T, values: PgUpdateSetSource<T>, where?: SQL, returning?: Selection): Promise<unknown[]> {
  const command = database(store).update(table).set(values).where(where);
  const rows = returning ? await command.returning(returning) : await command.returning();
  if (!Array.isArray(rows)) throw new Error("Mutation did not return a row list.");
  return rows;
}
export function deleteRecords<T extends PgTable>(store: TransactionExecutor, table: T, where?: SQL): Promise<InferSelectModel<T>[]>;
export function deleteRecords<T extends PgTable, P extends Selection>(store: TransactionExecutor, table: T, where: SQL | undefined, returning: P): Promise<Projected<P>[]>;
export async function deleteRecords<T extends PgTable>(store: TransactionExecutor, table: T, where?: SQL, returning?: Selection): Promise<unknown[]> {
  const command = database(store).delete(table).where(where);
  const rows = returning ? await command.returning(returning) : await command.returning();
  if (!Array.isArray(rows)) throw new Error("Mutation did not return a row list.");
  return rows;
}
