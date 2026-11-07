import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";
import { createMariaDbConnection } from "./connection";
import { createMariaDbApplicationDriver } from "./application-driver";
import * as schema from "./application-schema";

// The test socket is explicitly forbidden by the connector in production.
// No DATABASE_URL/PostgreSQL fallback exists in this target.
const target = process.env.MARIADB_TEST_SOCKET
  ? createMariaDbConnection({
    socketPath: process.env.MARIADB_TEST_SOCKET,
    database: process.env.MARIADB_TEST_DATABASE,
    user: "root",
  })
  : createMariaDbConnection();
export const pool = target.pool;
export const db = createMariaDbApplicationDriver(pool, schema);
export * from "./application-schema";

/** Read-only startup verification; schema and infrastructure are imported separately. */
export async function verifyApplicationDatabase(): Promise<void> {
  await target.verifyTarget();
  const expected = Object.values(schema).filter(table => is(table, MySqlTable));
  const actual = await db.execute<{ table_name: string; column_name: string }>(sql`
    SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
    FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE()
  `);
  const columns = new Set(actual.rows.map(row => `${row.table_name}.${row.column_name}`));
  const missing = expected.flatMap(table => Object.values(getTableColumns(table))
    .filter(column => !columns.has(`${getTableName(table)}.${column.name}`))
    .map(column => `${getTableName(table)}.${column.name}`));
  if (missing.length) throw new Error("MariaDB application schema is incomplete; import the reviewed schema and migrations.");
  const mutexes = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*) AS count FROM application_transaction_mutex WHERE id BETWEEN 0 AND 4095
  `);
  if (Number(mutexes.rows[0]?.count) !== 4096) {
    throw new Error("MariaDB transaction infrastructure is incomplete; import the mutex initialization.");
  }
}
