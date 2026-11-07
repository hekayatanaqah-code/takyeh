import { db, ownerWalletEntriesTable } from "@workspace/db";
import { lockResource } from "@workspace/db/transaction-lock";
import { eq, sql, desc } from "drizzle-orm";
import { subscriptionOwnerKeys } from "./subscription-access";
import type { PhotographyTx } from "./photography-allocation";

export async function walletOwnerKey(ownerId: string) {
  const keys = await subscriptionOwnerKeys(ownerId);
  return keys.find(k => /^owner_\d+$/.test(k)) ?? ownerId;
}
export async function lockOwnerWallet(tx: PhotographyTx, ownerId: string) {
  const key = await walletOwnerKey(ownerId);
  await lockResource(tx, 731250, key);
  return key;
}
export async function ownerWallet(ownerId: string, store: Pick<typeof db, "select"> = db) {
  const key = await walletOwnerKey(ownerId);
  const [row] = await store.select({ amount: sql<string>`coalesce(sum(${ownerWalletEntriesTable.amountHalalas}),0)`.mapWith(String) })
    .from(ownerWalletEntriesTable).where(eq(ownerWalletEntriesTable.ownerId, key));
  const balanceHalalas = Number(row.amount);
  if (!Number.isSafeInteger(balanceHalalas) || balanceHalalas < 0) throw new Error("wallet_ledger_invalid");
  const entries = await store.select().from(ownerWalletEntriesTable).where(eq(ownerWalletEntriesTable.ownerId, key))
    .orderBy(desc(ownerWalletEntriesTable.id)).limit(200);
  return { balanceHalalas, entries };
}
export async function debitOwnerWallet(tx: PhotographyTx, ownerId: string, amountHalalas: number, sourceKey: string, description: string) {
  const key = await lockOwnerWallet(tx, ownerId);
  const [existing] = await tx.select().from(ownerWalletEntriesTable).where(eq(ownerWalletEntriesTable.sourceKey, sourceKey));
  if (existing) {
    if (existing.ownerId !== key || existing.amountHalalas !== -amountHalalas) throw new Error("wallet_duplicate_mismatch");
    return;
  }
  if (!Number.isSafeInteger(amountHalalas) || amountHalalas <= 0) throw new Error("wallet_amount");
  if ((await ownerWallet(ownerId, tx)).balanceHalalas < amountHalalas) throw new Error("wallet_insufficient");
  await tx.insert(ownerWalletEntriesTable).values({ ownerId: key, amountHalalas: -amountHalalas, sourceKey, kind: "purchase", description });
}
export async function creditOwnerWallet(tx: PhotographyTx, ownerId: string, amountHalalas: number, sourceKey: string, description: string) {
  const key = await lockOwnerWallet(tx, ownerId);
  if (!Number.isSafeInteger(amountHalalas) || amountHalalas <= 0) throw new Error("wallet_amount");
  const [existing] = await tx.select().from(ownerWalletEntriesTable).where(eq(ownerWalletEntriesTable.sourceKey, sourceKey));
  if (existing) {
    if (existing.ownerId !== key || existing.amountHalalas !== amountHalalas) throw new Error("wallet_duplicate_mismatch");
    return;
  }
  await tx.insert(ownerWalletEntriesTable).values({ ownerId: key, amountHalalas, sourceKey, kind: "refund", description })
    .onConflictDoNothing({ target: ownerWalletEntriesTable.sourceKey });
}
