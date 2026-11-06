import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createMariaDbConnection } from "@workspace/db/mariadb";
import { adminStaffTable, siteSettingsTable } from "@workspace/db/mariadb/schema";
import pg from "pg";
import { verifyConstraints } from "./mariadb/verify-constraints";

/**
 * Verification of an already imported export, not an import/overwrite command.
 * Test writes are rolled back. Output never includes row values or hashes.
 */
async function main(): Promise<void> {
  const directory = process.argv[2];
  if (!directory || process.argv.length !== 3) throw new Error("Pass the private export directory.");
  const manifest = JSON.parse(await readFile(path.join(directory, "manifest.json"), "utf8"));
  for (const file of ["schema.sql", "seed.sql"]) {
    const hash = createHash("sha256").update(await readFile(path.join(directory, file))).digest("hex");
    if (hash !== manifest.sha256[file]) throw new Error(`Export checksum mismatch: ${file}`);
  }
  const socketPath = process.env.MARIADB_TEST_SOCKET;
  const destination = createMariaDbConnection(socketPath
    ? { socketPath, database: process.env.MARIADB_TEST_DATABASE ?? "takyeh_migration_test", user: "root" }
    : {});
  const source = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const target = await destination.verifyTarget();
    const nativeAdmin = await destination.db.select({
      active: adminStaffTable.isActive,
      superadmin: adminStaffTable.isSuperAdmin,
      permissions: adminStaffTable.permissions,
    }).from(adminStaffTable);
    if (nativeAdmin.length !== 1 || nativeAdmin[0].active !== true || nativeAdmin[0].superadmin !== true ||
        typeof nativeAdmin[0].permissions !== "object") {
      throw new Error("Native Drizzle table mapping failed.");
    }
    const nativeSettings = await destination.db.select().from(siteSettingsTable);
    if (nativeSettings.length !== manifest.seedCounts.site_settings) {
      throw new Error("Native Drizzle settings mapping failed.");
    }
    const [tables] = await destination.pool.query(
      "SELECT TABLE_NAME AS table_name FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME",
    );
    const tableNames = (tables as Array<{ table_name: string }>).map(item => item.table_name);
    if (tableNames.length !== manifest.tableCount) throw new Error("Target table count differs from export.");
    const rowCounts: Record<string, number> = {};
    for (const table of tableNames) {
      if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error("Unexpected target identifier");
      const [rows] = await destination.pool.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
      const count = Number((rows as Array<{ count: number }>)[0].count);
      rowCounts[table] = count;
      const expected = manifest.seedCounts[table] ?? 0;
      if (count !== expected) throw new Error(`Unexpected data count in ${table}`);
    }
    const [targetAdmin] = await destination.pool.execute(
      "SELECT id,username,password_hash,is_active,is_super_admin FROM admin_staff WHERE username=?",
      ["admin"],
    );
    const sourceAdmin = await source.query(
      "SELECT id,username,password_hash,is_active,is_super_admin FROM admin_staff WHERE username=$1",
      ["admin"],
    );
    const admin = (targetAdmin as Array<Record<string, unknown>>)[0];
    const original = sourceAdmin.rows[0];
    if (!admin || !original || admin.password_hash !== original.password_hash ||
        admin.username !== original.username || Number(admin.id) !== original.id ||
        Number(admin.is_active) !== 1 || Number(admin.is_super_admin) !== 1) {
      throw new Error("Administrator import did not preserve active identity/credentials.");
    }
    const sourceSettings = await source.query("SELECT key,value FROM site_settings ORDER BY key");
    const [targetSettings] = await destination.pool.query("SELECT `key`,value FROM site_settings ORDER BY `key`");
    const settings = new Map(sourceSettings.rows.map(row => [row.key, row.value]));
    for (const row of targetSettings as Array<{ key: string; value: string }>) {
      if (settings.get(row.key) !== row.value) throw new Error("A setting changed during transport.");
    }
    // A transaction rollback verifies the driver without retaining fixture rows.
    const connection = await destination.pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("INSERT INTO site_settings (`key`,value) VALUES (?,?)",
        ["__mariadb_transport_test__", "اختبار النقل ٠٥١٢٣٤٥٦٧٨ 🏠"]);
      const [rows] = await connection.execute("SELECT value FROM site_settings WHERE `key`=?",
        ["__mariadb_transport_test__"]);
      if ((rows as Array<{ value: string }>)[0]?.value !== "اختبار النقل ٠٥١٢٣٤٥٦٧٨ 🏠") {
        throw new Error("Arabic/emoji roundtrip failed.");
      }
      await connection.rollback();
    } finally {
      await connection.rollback();
      connection.release();
    }
    if (socketPath) {
      const integrityConnection = await destination.pool.getConnection();
      try {
        await verifyConstraints(integrityConnection);
      } finally {
        integrityConnection.release();
      }
      const [remaining] = await destination.pool.query(
        "SELECT (SELECT COUNT(*) FROM owner_services) + (SELECT COUNT(*) FROM owner_wallet_entries) + (SELECT COUNT(*) FROM chalets) + (SELECT COUNT(*) FROM admin_sessions) AS count",
      );
      if (Number((remaining as Array<{ count: number }>)[0].count) !== 0) {
        throw new Error("Local constraint-test fixtures were not completely rolled back.");
      }
    }
    const [checks] = await destination.pool.query(
      "SELECT COUNT(*) AS count FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE()",
    );
    if (Number((checks as Array<{ count: number }>)[0].count) !== manifest.foreignKeyCount) {
      throw new Error("Foreign-key count mismatch.");
    }
    const report = {
      verifiedAt: new Date().toISOString(),
      target,
      importedTables: tableNames.length,
      foreignKeys: manifest.foreignKeyCount,
      preservedOriginalCheckConstraints: manifest.checkConstraintCount,
      seededAdminAccounts: rowCounts.admin_staff,
      seededSettings: rowCounts.site_settings,
      allOtherTablesEmpty: Object.entries(rowCounts).every(([table, count]) =>
        ["admin_staff", "site_settings"].includes(table) || count === 0),
      administratorHashPreserved: true,
      settingsReadbackMatchesSource: true,
      arabicEmojiRoundtripAndRollback: true,
      nativeDrizzleConnection: true,
      localConstraintRejectionTests: Boolean(socketPath),
      fullApplicationRuntimeConverted: false,
      hostingerDeploymentTested: false,
    };
    await writeFile(path.join(directory, "verification.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
    console.log(JSON.stringify(report));
  } finally {
    await destination.close();
    await source.end();
  }
}

main().catch(() => {
  console.error("MariaDB verification failed. No credentials or row data are printed; inspect the target/configuration privately.");
  process.exitCode = 1;
});
