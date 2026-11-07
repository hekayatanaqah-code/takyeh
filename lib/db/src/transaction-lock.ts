import { createHash, randomUUID } from "node:crypto";
import { sql, type SQL } from "drizzle-orm";

// Fixed lock stripes avoid dialect-specific UPSERT and lock-table growth.
// Hash collisions serialize unrelated resources; they cannot bypass a lock.
export const TRANSACTION_MUTEX_COUNT = 4096;
export const transactionMutexDDL = "CREATE TABLE application_transaction_mutex (id INTEGER NOT NULL PRIMARY KEY)";
export const transactionMutexSeedSQL = `INSERT INTO application_transaction_mutex (id) VALUES ${
  Array.from({ length: TRANSACTION_MUTEX_COUNT }, (_, index) => `(${index})`).join(",")
}`;
export type TransactionExecutor = { execute(query: SQL): Promise<unknown> };

function resultRows(result: unknown): unknown {
  return Array.isArray(result) ? result[0] :
    result && typeof result === "object" && "rows" in result ? result.rows : undefined;
}
function duplicateMutex(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if (("code" in current && current.code === "23505") || ("errno" in current && current.errno === 1062)) return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export function resourceLockDigest(namespace: string, ...parts: string[]): Buffer {
  const values = [namespace, ...parts];
  if (values.some(value => typeof value !== "string" || !value || value.length > 1024)) {
    throw new Error("Invalid transaction lock identity.");
  }
  return createHash("sha256").update(JSON.stringify(values), "utf8").digest();
}

export async function lockResourceDigests(tx: TransactionExecutor, digests: readonly Buffer[]): Promise<void> {
  if (digests.length > 128 || digests.some(key => !Buffer.isBuffer(key) || key.length !== 32)) {
    throw new Error("Invalid transaction locks.");
  }
  const stripes = [...new Set(digests.map(key => key.readUInt16BE(0) >>> 4))].sort((a, b) => a - b);
  for (const stripe of stripes) {
    let rows = resultRows(await tx.execute(sql`SELECT id FROM application_transaction_mutex WHERE id=${stripe} FOR UPDATE`));
    if (Array.isArray(rows) && rows.length === 0) {
      // A managed schema publish may create an empty reference table. Initialize
      // only the missing technical row, never DDL/business seed. A savepoint
      // preserves earlier transaction work when another instance wins INSERT.
      // No financial operation is retried, and unrelated errors still fail.
      const point = sql.identifier(`mutex_${randomUUID().replaceAll("-", "")}`);
      await tx.execute(sql`SAVEPOINT ${point}`);
      try {
        await tx.execute(sql`INSERT INTO application_transaction_mutex (id) VALUES (${stripe})`);
      } catch (error) {
        await tx.execute(sql`ROLLBACK TO SAVEPOINT ${point}`);
        if (!duplicateMutex(error)) throw error;
      } finally {
        await tx.execute(sql`RELEASE SAVEPOINT ${point}`);
      }
      rows = resultRows(await tx.execute(sql`SELECT id FROM application_transaction_mutex WHERE id=${stripe} FOR UPDATE`));
    }
    // Only driver response framing differs. SQL, identities and transaction
    // lifetime are the same; never fall back to a process-local mutex.
    if (!Array.isArray(rows) || rows.length !== 1 ||
        !rows[0] || typeof rows[0] !== "object" || Number(rows[0].id) !== stripe) {
      throw new Error("Transaction mutex infrastructure is missing or invalid.");
    }
  }
}

/** Pass an ACTIVE transaction, not the application's pool/singleton. */
export async function lockResource(
  tx: TransactionExecutor, namespace: string | number, ...parts: Array<string | number>
): Promise<void> {
  if ([namespace, ...parts].some(value =>
    (typeof value !== "string" && typeof value !== "number") ||
    (typeof value === "number" && !Number.isFinite(value)))) {
    throw new Error("Invalid transaction lock identity.");
  }
  await lockResourceDigests(tx, [resourceLockDigest(String(namespace), ...parts.map(String))]);
}
