import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import mysql from "mysql2/promise";
import { eq, sql } from "drizzle-orm";
import { mysqlTable, int, varchar, decimal, json, datetime, primaryKey, boolean } from "drizzle-orm/mysql-core";
import { createMariaDbConnection } from "@workspace/db/mariadb";
import { insertRecords, updateRecords, deleteRecords, writeRecords } from "@workspace/db/mariadb/commands";
import { transactionLockDDL, withMariaDbTransaction } from "@workspace/db/mariadb/transaction";
import { transactionMutexSeedSQL } from "@workspace/db/transaction-lock";
import { addSqlDays,sqlInteger,sqlCustomerPhone } from "@workspace/db/mariadb/sql-expressions";
import { createMariaDbApplicationDriver, type NativeApplicationTransaction } from "@workspace/db/mariadb/application-driver";
import { withRawResultCodecs } from "@workspace/db/raw-result-codecs";

// Table-level keys mirror the generated application models, not just hand-made
// inline primary keys. Tests never use an application database or real accounts.
const probe = mysqlTable("command_probe", {
  id: int("id").notNull().autoincrement(),
  email: varchar("email", { length: 191 }).notNull().unique(),
  token: varchar("token", { length: 191 }).notNull().unique(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull().default("0.00"),
  counter: int("counter").notNull().default(1),
  enabled: boolean("enabled").notNull().default(true),
  detail: json("detail").$type<string[]>().notNull(),
  changedAt: datetime("changed_at", { mode: "date", fsp: 6 }).notNull(),
}, table => [primaryKey({ columns: [table.id] })]);
const uuidProbe = mysqlTable("uuid_probe", {
  id: varchar("id", { length: 36 }).notNull().default(sql`UUID()`),
  value: varchar("value", { length: 191 }).notNull(),
}, table => [primaryKey({ columns: [table.id] })]);
const onlyKey = mysqlTable("only_key", {
  key: varchar("key", { length: 191 }).notNull(),
}, table => [primaryKey({ columns: [table.key] })]);

test("MariaDB command semantics: projections, targeted conflicts, savepoints and concurrent upserts", { timeout: 60000 }, async () => {
  const socketPath = process.env.MARIADB_TEST_SOCKET;
  assert.ok(socketPath && process.env.NODE_ENV !== "production", "An isolated local test socket is required.");
  const database = `takyeh_commands_test_${randomBytes(6).toString("hex")}`;
  const control = await mysql.createConnection({ socketPath, user: "root", charset: "utf8mb4" });
  let target: ReturnType<typeof createMariaDbConnection> | undefined;
  try {
    await control.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin`);
    target = createMariaDbConnection({ socketPath, database, user: "root" });
    await target.verifyTarget();
    await target.pool.query(transactionLockDDL);
    await target.pool.query(transactionMutexSeedSQL);
    await target.pool.query(`CREATE TABLE command_probe (
      id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(191) NOT NULL UNIQUE,
      token VARCHAR(191) NOT NULL UNIQUE, amount DECIMAL(14,2) NOT NULL DEFAULT 0,
      counter INT NOT NULL DEFAULT 1 CHECK(counter>0), enabled BOOLEAN NOT NULL DEFAULT 1,
      detail JSON NOT NULL,
      changed_at DATETIME(6) NOT NULL
    ) ENGINE=InnoDB`);
    await target.pool.query("CREATE TABLE uuid_probe (id VARCHAR(36) PRIMARY KEY DEFAULT(UUID()), value VARCHAR(191) NOT NULL) ENGINE=InnoDB");
    await target.pool.query("CREATE TABLE only_key (`key` VARCHAR(191) PRIMARY KEY) ENGINE=InnoDB");
    const db = target.db;
    const at = new Date("2026-11-07T00:00:00.123Z");
    const value = (key: string) => ({ email: key, token: `token-${key}`, detail: ["نص عربي 🏠"], changedAt: at });
    const [first] = await insertRecords(db, probe, { ...value("first"), amount: "9999999999.99" });
    assert.equal(first.amount, "9999999999.99");
    assert.deepEqual(first.detail, ["نص عربي 🏠"]);
    assert.equal(first.changedAt.toISOString(), at.toISOString());
    const projected = await updateRecords(db, probe, { email: "changed" }, eq(probe.email, "first"),
      { id: probe.id, name: probe.email, calculated: sql<number>`2 + 3`.mapWith(Number) });
    assert.deepEqual(projected, [{ id: first.id, name: "changed", calculated: 5 }]);
    assert.deepEqual(await insertRecords(db, probe, value("changed"), {
      conflict: { action: "ignore", target: probe.email },
    }), []);
    await assert.rejects(insertRecords(db, probe, { ...value("different-key"), token: first.token }, {
      conflict: { action: "ignore", target: probe.email },
    }), error => {
      let cause: unknown = error;
      while (cause && typeof cause === "object") {
        if ("errno" in cause && cause.errno === 1062) return true;
        cause = "cause" in cause ? cause.cause : undefined;
      }
      return false;
    });
    await assert.rejects(insertRecords(db, probe, { ...value("bad-check"), counter: -1 }, {
      conflict: { action: "ignore" },
    }));
    assert.deepEqual(await insertRecords(db, probe, value("changed"), {
      conflict: { action: "update", target: probe.email, set: { counter: 2 }, setWhere: sql`FALSE` },
    }), []);
    const updated = await writeRecords(db, probe, value("changed"), {
      conflict: { action: "update", target: probe.email, set: { id: first.id, counter: 2 } },
    });
    assert.equal(updated.rowCount, 1);
    assert.equal(updated.rows[0].id, first.id);
    await assert.rejects(insertRecords(db, probe, value("changed"), {
      conflict: { action: "update", target: probe.email, set: { id: first.id + 100 } },
    }), /primary key/);
    assert.deepEqual(await deleteRecords(db, probe, eq(probe.id, first.id), { name: probe.email }), [{ name: "changed" }]);

    await db.transaction(async tx => {
      await insertRecords(tx, probe, value("preserved"));
      await assert.rejects(insertRecords(tx, probe, [value("partial"), value("preserved")]));
      assert.deepEqual(await tx.select().from(probe).where(eq(probe.email, "partial")), []);
    });
    await assert.rejects(withMariaDbTransaction(target.pool, [], async tx => {
      await insertRecords(tx.db, probe, value("must-rollback"));
      throw new Error("rollback-manual-transaction");
    }), /rollback-manual-transaction/);
    assert.deepEqual(await db.select().from(probe).where(eq(probe.email, "must-rollback")), []);
    await Promise.all(Array.from({ length: 12 }, () => insertRecords(db, probe, value("concurrent"), {
      conflict: { action: "update", target: probe.email, set: { counter: sql`${probe.counter} + 1` } },
    })));
    const counters = await db.select().from(probe).where(eq(probe.email, "concurrent"));
    assert.equal(counters.length, 1);
    assert.equal(counters[0].counter, 12);
    const [uuid] = await insertRecords(db, uuidProbe, { value: "افتراضي" }, { returning: { id: uuidProbe.id } });
    assert.match(uuid.id, /^[0-9a-f-]{36}$/);
    await insertRecords(db, onlyKey, { key: "same" });
    assert.deepEqual(await insertRecords(db, onlyKey, { key: "same" }, {
      conflict: { action: "update", target: onlyKey.key, set: { key: "same" } },
    }), [{ key: "same" }]);
    assert.throws(() => addSqlDays(sql`NOW()`, undefined), /integer/);
    const [dateRows] = await db.execute(sql`SELECT ${addSqlDays(sql`CAST('2024-02-28' AS DATE)`, 2)} AS result`);
    const decodedRows: unknown = dateRows;
    assert.ok(Array.isArray(decodedRows));
    const firstDate: unknown = decodedRows[0];
    assert.ok(firstDate && typeof firstDate === "object" && "result" in firstDate);
    const result = firstDate.result;
    assert.ok(result instanceof Date || typeof result === "string");
    assert.equal(result instanceof Date ? result.toISOString().slice(0, 10) : result.slice(0, 10), "2024-03-01");

    const application = createMariaDbApplicationDriver(target.pool, { probe, uuidProbe, onlyKey });
    const integer = withRawResultCodecs(sql`CAST(counter AS SIGNED)`, { sequence: "integer" });
    const framed = await application.execute(sql`SELECT detail, enabled, changed_at, amount,
      ${integer} AS sequence, COUNT(*) OVER () AS records
      FROM command_probe WHERE email = ${"concurrent"}`);
    assert.equal(framed.rowCount, 1);
    assert.deepEqual(framed.rows[0].detail, ["نص عربي 🏠"]);
    assert.equal(framed.rows[0].enabled, true);
    assert.equal(framed.rows[0].amount, "0.00");
    assert.equal(framed.rows[0].sequence, 12);
    assert.equal(framed.rows[0].records, "1");
    assert.ok(framed.rows[0].changed_at instanceof Date);
    assert.equal(framed.rows[0].changed_at.toISOString(), at.toISOString());
    const scalarProjection = await application.execute(sql`SELECT ${sqlInteger(sql`12`,"count")} AS count,
      ${sqlCustomerPhone(sql`${"+٩٦٦ ٥٠٠٠٠٠٠٠٠"}`)} AS phone`);
    assert.equal(scalarProjection.rows[0].count,12);
    assert.equal(scalarProjection.rows[0].phone,"0500000000");
    await assert.rejects(application.execute(sql`SELECT ${sqlInteger(sql`${"not-an-integer"}`,"count")} AS count`));
    await assert.rejects(application.execute(sql`SELECT ${sqlInteger(sql`${"2147483648"}`,"count")} AS count`));
    const batch = Array.from({length:8},(_,index)=>value(`ordered-batch-${index}`));
    await Promise.all([batch,[...batch].reverse()].map(values=>insertRecords(application,probe,values,{
      conflict:{action:"update",target:probe.email,set:{counter:sql`${probe.counter}+1`}},
    })));
    const batchRows = await db.select().from(probe).where(sql`${probe.email} LIKE 'ordered-batch-%'`);
    assert.equal(batchRows.length,8);
    assert.ok(batchRows.every(row=>row.counter===2));
    const noChange = await application.execute(sql`UPDATE command_probe SET counter=counter WHERE email=${"concurrent"}`);
    assert.equal(noChange.rowCount, 1, "matched-row counts include unchanged updates, like PostgreSQL");
    const expression = withRawResultCodecs(sql`JSON_ARRAY(${"أ"}, ${"ب"})`, { items: "json" });
    assert.deepEqual((await application.execute(sql`SELECT ${expression} AS items`)).rows, [{ items: ["أ", "ب"] }]);
    let closed: NativeApplicationTransaction | undefined;
    await assert.rejects(application.transaction(async tx => {
      closed = tx;
      await insertRecords(tx, probe, value("framed-rollback"));
      await assert.rejects(tx.transaction(async inner => {
        await insertRecords(inner, probe, value("nested-rollback"));
        throw new Error("nested-rejected");
      }), /nested-rejected/);
      assert.equal((await tx.select().from(probe).where(eq(probe.email, "nested-rollback"))).length, 0);
      await tx.execute(sql`ALTER TABLE command_probe ADD unsafe_column INT`);
    }), /schema/);
    assert.equal((await db.select().from(probe).where(eq(probe.email, "framed-rollback"))).length, 0);
    assert.ok(closed);
    const finished = closed;
    assert.throws(() => finished.select(), /closed/);
  } finally {
    await target?.close();
    await control.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await control.end();
  }
});
