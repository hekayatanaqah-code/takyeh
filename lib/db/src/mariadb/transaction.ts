import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import type { Pool, PoolConnection } from "mysql2/promise";
import { lockResourceDigests, resourceLockDigest, transactionMutexDDL } from "../transaction-lock";

/**
 * Provision separately, before accepting traffic. Never run DDL inside a money
 * transaction: MariaDB DDL implicitly commits even when issued inside BEGIN.
 */
export const transactionLockDDL = `${transactionMutexDDL} ENGINE=InnoDB`;

export type MariaDbTransaction = {
  connection: PoolConnection;
  db: MySql2Database<Record<string, unknown>> & { $client: PoolConnection };
};

export async function lockMariaDbTransaction(tx: MariaDbTransaction, lockKeys: readonly Buffer[]): Promise<void> {
  await lockResourceDigests(tx.db, lockKeys);
}

/** Unambiguous, case-sensitive identity; do not reuse PostgreSQL hashtext IDs. */
export function transactionLockKey(namespace: string, ...parts: string[]): Buffer {
  return resourceLockDigest(namespace, ...parts);
}

/**
 * All locks and business statements run on ONE connection, within ONE InnoDB
 * transaction. Locks expire on commit/rollback, not on a pooled connection's
 * lifetime. No GET_LOCK, advisory-lock emulation or automatic payment retries.
 *
 * READ COMMITTED prevents a pre-lock snapshot from returning stale balances
 * after waiting for another writer. All writers for a resource must use the
 * same canonical lock identity. The callback must not issue transaction/DDL
 * commands or external side effects, and must not retain the connection.
 */
export async function withMariaDbTransaction<T>(
  pool: Pool,
  lockKeys: readonly Buffer[],
  work: (tx: MariaDbTransaction) => Promise<T>,
): Promise<T> {
  if (lockKeys.length > 128 || lockKeys.some(key => !Buffer.isBuffer(key) || key.length !== 32)) {
    throw new Error("Invalid transaction locks.");
  }
  // Stable order prevents cycles when callers supply overlapping resource sets.
  const connection = await pool.getConnection();
  let started = false;
  let reusable = true;
  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
    await connection.beginTransaction();
    started = true;
    const tx = { connection, db: drizzle(connection, { mode: "default" }) };
    await lockMariaDbTransaction(tx, lockKeys);
    const result = await work(tx);
    try {
      await connection.commit();
    } catch {
      // A failed COMMIT can have an unknown outcome. Never automatically replay
      // the callback; reconciliation/idempotency belongs to the business layer.
      reusable = false;
      throw new Error("Transaction commit outcome unknown; reconcile before retrying.");
    }
    started = false;
    return result;
  } catch (error) {
    if (started && reusable) {
      try {
        await connection.rollback();
      } catch {
        reusable = false;
      }
    }
    throw error;
  } finally {
    if (reusable) connection.release();
    else connection.destroy();
  }
}
