import { and, eq, getTableColumns, or, type GetColumnData, type InferSelectModel, type SQL } from "drizzle-orm";
import {
  getTableConfig, type AnyMySqlColumn, type MySqlTable,
  type MySqlInsertValue, type MySqlUpdateSetSource,
} from "drizzle-orm/mysql-core";
import type { MariaDbTransaction } from "./transaction";

type Selection = Record<string, AnyMySqlColumn>;
type Selected<P extends Selection> = { [K in keyof P]: GetColumnData<P[K]> };

function keys<T extends MySqlTable>(table: T): AnyMySqlColumn[] {
  const config = getTableConfig(table);
  const columns = config.columns.filter(column => column.primary);
  const primary = columns.length ? columns : config.primaryKeys[0]?.columns;
  if (!primary?.length) throw new Error("Mutation read-back requires a primary key.");
  return primary;
}

function identity<T extends MySqlTable>(table: T, rows: Record<string, unknown>[]): SQL {
  const columns = getTableColumns(table);
  const primary = keys(table);
  const properties = primary.map(column => {
    const property = Object.entries(columns).find(([, item]) => item === column)?.[0];
    if (!property) throw new Error("Primary-key model mismatch.");
    return { property, column };
  });
  const conditions = rows.map(row => and(...properties.map(({ property, column }) => {
    if (row[property] === undefined || row[property] === null) throw new Error("Missing primary-key value.");
    return eq(column, row[property]);
  }))!);
  const where = or(...conditions);
  if (!where) throw new Error("Empty mutation identity.");
  return where;
}

/**
 * MariaDB-native replacement for UPDATE ... RETURNING.
 * Must be called inside withMariaDbTransaction, never on a pooled singleton.
 * Select/lock -> update -> read all share the same native transaction.
 * Primary-key changes are rejected: the original identity must remain stable.
 */
export async function updateAndRead<T extends MySqlTable>(
  tx: MariaDbTransaction, table: T, values: MySqlUpdateSetSource<T>, where: SQL,
): Promise<InferSelectModel<T>[]>;
export async function updateAndRead<T extends MySqlTable, P extends Selection>(
  tx: MariaDbTransaction, table: T, values: MySqlUpdateSetSource<T>, where: SQL, projection: P,
): Promise<Selected<P>[]>;
export async function updateAndRead<T extends MySqlTable>(
  tx: MariaDbTransaction, table: T, values: MySqlUpdateSetSource<T>, where: SQL, projection?: Selection,
): Promise<Record<string, unknown>[]> {
  const columns = getTableColumns(table);
  for (const key of keys(table)) {
    const property = Object.entries(columns).find(([, column]) => column === key)?.[0];
    if (property && property in values) throw new Error("Primary-key updates require an explicit migration.");
  }
  const before = await tx.db.select().from(table).where(where).for("update");
  if (!before.length) return [];
  const predicate = identity(table, before);
  await tx.db.update(table).set(values).where(predicate);
  const selection = projection ?? columns;
  return tx.db.select(selection).from(table).where(predicate);
}

/** DELETE read-back is captured under the same row locks before the deletion. */
export async function deleteAndRead<T extends MySqlTable>(
  tx: MariaDbTransaction, table: T, where: SQL,
): Promise<InferSelectModel<T>[]> {
  const before = await tx.db.select().from(table).where(where).for("update");
  if (!before.length) return [];
  await tx.db.delete(table).where(identity(table, before));
  return before;
}

/**
 * Single-row inserts use the actual driver insertId, never infer contiguous
 * ranges for bulk inserts. UUID/string/composite keys must be supplied
 * explicitly. Defaults (including JSON and dates) are read from the database.
 */
export async function insertAndRead<T extends MySqlTable>(
  tx: MariaDbTransaction, table: T, input: MySqlInsertValue<T>,
): Promise<InferSelectModel<T>> {
  const primary = keys(table);
  const columns = getTableColumns(table);
  const [result] = await tx.db.insert(table).values(input);
  const row: Record<string, unknown> = { ...input };
  for (const column of primary) {
    const property = Object.entries(columns).find(([, item]) => item === column)?.[0];
    if (!property) throw new Error("Primary-key model mismatch.");
    if (row[property] === undefined || row[property] === null) {
      if (primary.length !== 1 || !("autoIncrement" in column) || !column.autoIncrement ||
          !result.insertId || !Number.isSafeInteger(result.insertId)) {
        throw new Error("Insert identity must be explicit or a safe native auto-increment value.");
      }
      row[property] = result.insertId;
    }
  }
  const [saved] = await tx.db.select().from(table).where(identity(table, [row]));
  if (!saved) throw new Error("Inserted row could not be read back.");
  return saved;
}
