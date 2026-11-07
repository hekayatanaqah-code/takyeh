import { eq, sql } from "drizzle-orm";
import type { Pool } from "mysql2/promise";
import { ownerAccountLinksTable, ownerWalletEntriesTable } from "./application-schema";
import { insertAndRead } from "./mutations";
import { withMariaDbTransaction, transactionLockKey, lockMariaDbTransaction, type MariaDbTransaction } from "./transaction";

async function ownerKey(tx: MariaDbTransaction, ownerId: string): Promise<string> {
  if (!ownerId || ownerId.length > 191) throw new Error("wallet_owner");
  if (/^owner_\d+$/.test(ownerId)) return ownerId;
  const [link] = await tx.db.select({ applicationId: ownerAccountLinksTable.ownerApplicationId })
    .from(ownerAccountLinksTable).where(eq(ownerAccountLinksTable.userId, ownerId)).limit(1);
  return link ? `owner_${link.applicationId}` : ownerId;
}

export async function walletBalance(tx: MariaDbTransaction, canonicalOwnerId: string): Promise<number> {
  const [row] = await tx.db.select({
    amount: sql<string>`COALESCE(SUM(${ownerWalletEntriesTable.amountHalalas}), 0)`,
  }).from(ownerWalletEntriesTable).where(eq(ownerWalletEntriesTable.ownerId, canonicalOwnerId));
  if (!row) throw new Error("wallet_ledger_invalid");
  const balance = Number(row.amount);
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("wallet_ledger_invalid");
  return balance;
}

/**
 * Native financial operation, callable within an existing MariaDB transaction.
 * Source keys are globally unique. Lock both owner and source before reading,
 * so duplicate refunds cannot credit twice and concurrent purchases cannot
 * spend the same available balance. Never silently ignore a duplicate.
 */
export async function postWalletEntry(tx: MariaDbTransaction, input: {
  ownerId: string; amountHalalas: number; sourceKey: string; kind: "purchase" | "refund"; description: string;
}): Promise<void> {
  const { amountHalalas, sourceKey, kind } = input;
  if (!Number.isSafeInteger(amountHalalas) || amountHalalas === 0 ||
      (kind === "purchase" && amountHalalas > 0) || (kind === "refund" && amountHalalas < 0)) {
    throw new Error("wallet_amount");
  }
  if (!sourceKey || sourceKey.length > 191) throw new Error("wallet_source_key");
  const canonical = await ownerKey(tx, input.ownerId);
  await lockMariaDbTransaction(tx, [
    transactionLockKey("731250", canonical), transactionLockKey("wallet-source", sourceKey),
  ]);
  const [existing] = await tx.db.select().from(ownerWalletEntriesTable)
    .where(eq(ownerWalletEntriesTable.sourceKey, sourceKey)).limit(1);
  if (existing) {
    if (existing.ownerId !== canonical || existing.amountHalalas !== amountHalalas || existing.kind !== kind) {
      throw new Error("wallet_duplicate_mismatch");
    }
    return;
  }
  if (amountHalalas < 0 && await walletBalance(tx, canonical) < -amountHalalas) {
    throw new Error("wallet_insufficient");
  }
  await insertAndRead(tx, ownerWalletEntriesTable, {
    ownerId: canonical, amountHalalas, sourceKey, kind, description: input.description,
  });
}

export function createMariaDbWallet(pool: Pool) {
  return {
    post(input: Parameters<typeof postWalletEntry>[1]) {
      return withMariaDbTransaction(pool, [], tx => postWalletEntry(tx, input));
    },
    balance(ownerId: string) {
      return withMariaDbTransaction(pool, [], async tx => walletBalance(tx, await ownerKey(tx, ownerId)));
    },
  };
}
