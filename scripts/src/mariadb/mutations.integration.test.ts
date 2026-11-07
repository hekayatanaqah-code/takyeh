import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mysql, { type RowDataPacket } from "mysql2/promise";
import { eq, sql } from "drizzle-orm";
import { mysqlTable, int, decimal, json, datetime } from "drizzle-orm/mysql-core";
import { createMariaDbConnection } from "@workspace/db/mariadb";
import { transactionLockDDL, withMariaDbTransaction } from "@workspace/db/mariadb/transaction";
import { insertAndRead, updateAndRead, deleteAndRead } from "@workspace/db/mariadb/mutations";
import { createMariaDbWallet, postWalletEntry } from "@workspace/db/mariadb/wallet";
import { transactionMutexSeedSQL } from "@workspace/db/transaction-lock";

const probe = mysqlTable("mutation_probe", {
  id: int("id").primaryKey().autoincrement(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  detail: json("detail").$type<{ name: string; quantity: number }[]>().notNull(),
  changedAt: datetime("changed_at", { mode: "date", fsp: 6 }).notNull(),
});

test("native mutation read-back, decimal/JSON mapping and real wallet ledger concurrency", { timeout: 30000 }, async () => {
  const socketPath = process.env.MARIADB_TEST_SOCKET;
  assert.ok(socketPath && process.env.NODE_ENV !== "production", "An isolated local test socket is required.");
  const database = `takyeh_money_test_${randomBytes(6).toString("hex")}`;
  const control = await mysql.createConnection({ socketPath, user: "root", charset: "utf8mb4" });
  let target: ReturnType<typeof createMariaDbConnection> | undefined;
  try {
    await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    target = createMariaDbConnection({ socketPath, database, user: "root" });
    await target.verifyTarget();
    await target.pool.query(transactionLockDDL);
    await target.pool.query(transactionMutexSeedSQL);
    await target.pool.query(`CREATE TABLE mutation_probe (
      id INT PRIMARY KEY AUTO_INCREMENT, amount DECIMAL(14,2) NOT NULL,
      detail JSON NOT NULL, changed_at DATETIME(6) NOT NULL
    ) ENGINE=InnoDB`);
    await target.pool.query(`CREATE TABLE owner_account_links (
      user_id VARCHAR(191) PRIMARY KEY, owner_application_id INT NOT NULL UNIQUE
    ) ENGINE=InnoDB`);
    await target.pool.query(`CREATE TABLE owner_wallet_entries (
      id INT AUTO_INCREMENT PRIMARY KEY, owner_id VARCHAR(191) NOT NULL,
      source_key VARCHAR(191) NOT NULL UNIQUE, kind LONGTEXT NOT NULL,
      amount_halalas INT NOT NULL CHECK(amount_halalas<>0), description LONGTEXT NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX wallet_owner_idx(owner_id)
    ) ENGINE=InnoDB`);
    await target.pool.execute("INSERT INTO owner_account_links VALUES (?,?)", ["native-test-user", 42]);

    await withMariaDbTransaction(target.pool, [], async tx => {
      const at = new Date("2026-11-07T00:00:00.123Z");
      const inserted = await insertAndRead(tx, probe, {
        amount: "9999999999.99", detail: [{ name: "خدمة عربية 🏠", quantity: 2 }], changedAt: at,
      });
      assert.equal(inserted.amount, "9999999999.99");
      assert.deepEqual(inserted.detail, [{ name: "خدمة عربية 🏠", quantity: 2 }]);
      assert.equal(inserted.changedAt.toISOString(), at.toISOString());
      const updated = await updateAndRead(tx, probe, { amount: "0.00" },
        eq(probe.amount, "9999999999.99"), { id: probe.id, amount: probe.amount });
      assert.deepEqual(updated, [{ id: inserted.id, amount: "0.00" }], "read by locked primary key after changing the predicate column");
      assert.deepEqual(await updateAndRead(tx, probe, { amount: "1.00" }, eq(probe.id, -1)), []);
      await assert.rejects(updateAndRead(tx, probe, { id: 100 }, eq(probe.id, inserted.id)), /Primary-key/);
      const deleted = await deleteAndRead(tx, probe, eq(probe.id, inserted.id));
      assert.equal(deleted[0].amount, "0.00");
      assert.deepEqual(await tx.db.select().from(probe), []);
    });

    const wallet = createMariaDbWallet(target.pool);
    const credit = { ownerId: "native-test-user", amountHalalas: 1000, sourceKey: "credit-once", kind: "refund" as const, description: "استرداد تجريبي" };
    await Promise.all([wallet.post(credit), wallet.post({ ...credit, ownerId: "owner_42" })]);
    assert.equal(await wallet.balance("native-test-user"), 1000);
    assert.equal(await wallet.balance("owner_42"), 1000);
    await assert.rejects(wallet.post({ ...credit, amountHalalas: 1001 }), /wallet_duplicate_mismatch/);
    await assert.rejects(wallet.post({ ...credit, ownerId: "other-owner" }), /wallet_duplicate_mismatch/);
    const purchases = await Promise.allSettled(Array.from({ length: 10 }, (_, index) => wallet.post({
      ownerId: index % 2 ? "owner_42" : "native-test-user", amountHalalas: -200,
      sourceKey: `purchase-${index}`, kind: "purchase", description: "شراء تجريبي",
    })));
    assert.equal(purchases.filter(result => result.status === "fulfilled").length, 5);
    assert.equal(purchases.filter(result => result.status === "rejected" && result.reason.message === "wallet_insufficient").length, 5);
    assert.equal(await wallet.balance("owner_42"), 0);
    await assert.rejects(withMariaDbTransaction(target.pool, [], async tx => {
      await postWalletEntry(tx, { ...credit, sourceKey: "rolled-back-credit" });
      throw new Error("rollback-ledger");
    }), /rollback-ledger/);
    assert.equal(await wallet.balance("owner_42"), 0);
    const [sum] = await target.pool.query<RowDataPacket[]>(
      "SELECT SUM(amount_halalas) AS balance, COUNT(*) AS entries FROM owner_wallet_entries WHERE owner_id='owner_42'",
    );
    assert.equal(Number(sum[0].balance), 0);
    assert.equal(Number(sum[0].entries), 6);
    await assert.rejects(withMariaDbTransaction(target.pool, [], tx =>
      insertAndRead(tx, probe, { amount: sql`'not-a-decimal'`, detail: [], changedAt: new Date() })));
  } finally {
    await target?.close();
    await control.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await control.end();
  }
});
