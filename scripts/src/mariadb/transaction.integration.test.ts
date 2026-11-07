import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import { createMariaDbConnection } from "@workspace/db/mariadb";
import { transactionLockDDL, transactionLockKey, withMariaDbTransaction } from "@workspace/db/mariadb/transaction";

test("lock identities are unambiguous and ordered by the transaction wrapper", () => {
  assert.notDeepEqual(transactionLockKey("capacity", "1:2", "3"), transactionLockKey("capacity", "1", "2:3"));
  assert.notDeepEqual(transactionLockKey("wallet", "A"), transactionLockKey("wallet", "a"));
  assert.equal(transactionLockKey("wallet", "مالك").length, 32);
  assert.throws(() => transactionLockKey("", "owner"));
});

test("an unknown COMMIT outcome destroys its connection and never retries work", async () => {
  let callbacks = 0;
  let destroyed = false;
  let released = false;
  let rollback = false;
  const connection = {
    query: async () => {},
    execute: async () => {},
    beginTransaction: async () => {},
    commit: async () => { throw new Error("simulated transport failure"); },
    rollback: async () => { rollback = true; },
    release: () => { released = true; },
    destroy: () => { destroyed = true; },
  };
  const pool = { getConnection: async () => connection } as unknown as Pool;
  await assert.rejects(withMariaDbTransaction(pool, [], async () => { callbacks++; }), /outcome unknown/);
  assert.equal(callbacks, 1);
  assert.equal(destroyed, true);
  assert.equal(released, false);
  assert.equal(rollback, false);
});

test("native InnoDB serialization, money rollback, capacity and pooled lock release", { timeout: 30000 }, async () => {
  const socketPath = process.env.MARIADB_TEST_SOCKET;
  assert.ok(socketPath && process.env.NODE_ENV !== "production",
    "This test requires an explicitly selected local MariaDB test socket; never use a live database.");
  const database = `takyeh_tx_test_${randomBytes(6).toString("hex")}`;
  const control = await mysql.createConnection({ socketPath, user: "root", charset: "utf8mb4" });
  let store: ReturnType<typeof createMariaDbConnection> | undefined;
  try {
    await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    store = createMariaDbConnection({ socketPath, database, user: "root" });
    await store.verifyTarget();
    await store.pool.query(transactionLockDDL);
    await store.pool.query("CREATE TABLE wallet_probe (id INT PRIMARY KEY, amount_halalas BIGINT NOT NULL CHECK (amount_halalas>=0)) ENGINE=InnoDB");
    await store.pool.query("CREATE TABLE capacity_probe (id INT AUTO_INCREMENT PRIMARY KEY, resource_id INT NOT NULL) ENGINE=InnoDB");
    await store.pool.query("INSERT INTO wallet_probe VALUES (1,100)");

    const walletKey = transactionLockKey("wallet", "test-owner");
    const debit = () => withMariaDbTransaction(store!.pool, [walletKey], async ({ connection }) => {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT amount_halalas FROM wallet_probe WHERE id=1");
      if (Number(rows[0].amount_halalas) < 100) throw new Error("insufficient");
      await connection.execute("UPDATE wallet_probe SET amount_halalas=amount_halalas-100 WHERE id=1");
    });
    const debits = await Promise.allSettled([debit(), debit()]);
    assert.equal(debits.filter(item => item.status === "fulfilled").length, 1, "one balance cannot be spent twice");
    assert.equal(debits.filter(item => item.status === "rejected" && item.reason.message === "insufficient").length, 1);
    const [balance] = await store.pool.query<RowDataPacket[]>("SELECT amount_halalas FROM wallet_probe WHERE id=1");
    assert.equal(Number(balance[0].amount_halalas), 0);

    const capacityKey = transactionLockKey("service-capacity", "provider-1", "2030-01-01");
    const reserve = () => withMariaDbTransaction(store!.pool, [capacityKey], async ({ connection }) => {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM capacity_probe WHERE resource_id=1");
      if (Number(rows[0].count) >= 1) throw new Error("full");
      await connection.execute("INSERT INTO capacity_probe(resource_id) VALUES (?)", [1]);
    });
    const bookings = await Promise.allSettled([reserve(), reserve(), reserve()]);
    assert.equal(bookings.filter(item => item.status === "fulfilled").length, 1);
    assert.equal(bookings.filter(item => item.status === "rejected" && item.reason.message === "full").length, 2);

    await assert.rejects(withMariaDbTransaction(store.pool, [walletKey], async ({ connection }) => {
      await connection.execute("UPDATE wallet_probe SET amount_halalas=999 WHERE id=1");
      throw new Error("rollback-test");
    }), /rollback-test/);
    await withMariaDbTransaction(store.pool, [walletKey], async ({ connection }) => {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT amount_halalas FROM wallet_probe WHERE id=1");
      assert.equal(Number(rows[0].amount_halalas), 0, "rollback discarded the write and released its lock");
    });

    const independentKey = transactionLockKey("wallet", "another-owner");
    let unlock!: () => void;
    let entered!: () => void;
    const parked = new Promise<void>(resolve => { unlock = resolve; });
    const acquired = new Promise<void>(resolve => { entered = resolve; });
    const held = withMariaDbTransaction(store.pool, [walletKey], async () => { entered(); await parked; });
    await acquired;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        withMariaDbTransaction(store.pool, [independentKey], async () => {}),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("independent resource blocked")), 3000); }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      unlock();
      await held;
    }
    await Promise.all([
      withMariaDbTransaction(store.pool, [walletKey, independentKey], async () => {}),
      withMariaDbTransaction(store.pool, [independentKey, walletKey, walletKey], async () => {}),
    ]);
    // Probes prove the primitive, not ported application workflows.
  } finally {
    await store?.close();
    await control.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await control.end();
  }
});
