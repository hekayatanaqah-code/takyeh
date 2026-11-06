import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import pg from "pg";
import { buildSchema, identifier, seedLiteral } from "./mariadb/schema-converter";
import { readCatalog } from "./mariadb/read-catalog";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// Hidden path is denied by the preview servers as well as excluded from Git/deploy.
const outputRoot = path.join(root, ".local/mariadb-exports");
const args = process.argv.slice(2);
if (args.length !== 0) throw new Error("This exporter has no all-data or destructive mode.");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url || !/^postgres(ql)?:/.test(url)) throw new Error("A PostgreSQL source DATABASE_URL is required.");
  const source = new pg.Pool({ connectionString: url, max: 1 });
  const client = await source.connect();
  const runId = new Date().toISOString().replace(/[:.]/g, "-");
  const staging = path.join(outputRoot, `.staging-${runId}`);
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await client.query("SET LOCAL TIME ZONE 'UTC'");
    const catalog = await readCatalog(client);
    const schema = buildSchema(catalog);
    const admin = await client.query<{ row: Record<string, unknown> }>(
      "SELECT to_jsonb(t) AS row FROM admin_staff t WHERE username=$1 AND is_active=true AND is_super_admin=true",
      ["admin"],
    );
    if (admin.rowCount !== 1) throw new Error("Exactly one active superadmin named admin is required.");
    const settings = await client.query<{ row: Record<string, unknown> }>(
      "SELECT to_jsonb(t) AS row FROM site_settings t ORDER BY key",
    );
    // Credentials belong in environment secrets, never in downloadable settings.
    const excludedKeys: string[] = [];
    const settingsRows = settings.rows.filter(({ row }) => {
      const excluded = /password|secret|token|api[_-]?key|credential|private[_-]?key/i.test(String(row.key));
      if (excluded) excludedKeys.push(String(row.key));
      return !excluded;
    });
    const seedRows: Record<string, Record<string, unknown>[]> = {
      admin_staff: admin.rows.map(item => item.row),
      site_settings: settingsRows.map(item => item.row),
    };
    const seed = [
      "-- PRIVATE: contains the administrator password HASH and contact/settings data.",
      "-- Import after schema.sql into a NEW, EMPTY database; never serve from public_html.",
      "-- No owners, bookings, orders, sales, expenses, sessions, tokens or other staff are exported.",
      "SET NAMES utf8mb4 COLLATE utf8mb4_bin;",
      "SET time_zone = '+00:00';",
      "SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,NO_BACKSLASH_ESCAPES';",
      "START TRANSACTION;",
    ];
    for (const [table, rows] of Object.entries(seedRows)) {
      const columns = catalog.columns.filter(column => column.table_name === table);
      for (const row of rows) {
        for (const column of columns) {
          if (schema.narrowedColumns.includes(`${table}.${column.column_name}`) &&
              typeof row[column.column_name] === "string" && Array.from(row[column.column_name] as string).length > 191) {
            throw new Error(`Indexed seed exceeds VARCHAR(191): ${table}.${column.column_name}`);
          }
        }
        seed.push(`INSERT INTO ${identifier(table)} (${columns.map(column => identifier(column.column_name)).join(",")}) VALUES (${columns.map(column => seedLiteral(row[column.column_name], column)).join(",")});`);
      }
    }
    seed.push("COMMIT;");
    const seedSql = seed.join("\n") + "\n";
    const manifest = {
      format: 1,
      target: "MariaDB 10.11",
      createdAt: new Date().toISOString(),
      applicationRuntimeConverted: false,
      scope: "site_settings and active superadmin admin ONLY",
      tableCount: new Set(catalog.columns.map(column => column.table_name)).size,
      columnCount: catalog.columns.length,
      foreignKeyCount: catalog.constraints.filter(item => item.kind === "f").length,
      checkConstraintCount: catalog.constraints.filter(item => item.kind === "c").length,
      seedCounts: Object.fromEntries(Object.entries(seedRows).map(([table, rows]) => [table, rows.length])),
      excludedSensitiveSettingKeys: excludedKeys,
      narrowedIndexedTextColumns: schema.narrowedColumns,
      requiredReview: [
        "Indexed PostgreSQL TEXT columns become VARCHAR(191); other text remains LONGTEXT.",
        "PostgreSQL text arrays become JSON arrays; timestamps are UTC DATETIME(6).",
        "Partial unique indexes use nullable generated columns; original check/foreign-key constraints retained.",
        "The existing application remains PostgreSQL-only until its query and lock paths are ported.",
        "Uploaded logos/media are external objects and are NOT included in this SQL export.",
      ],
      sha256: {
        "schema.sql": createHash("sha256").update(schema.sql).digest("hex"),
        "seed.sql": createHash("sha256").update(seedSql).digest("hex"),
      },
    };
    await client.query("COMMIT");
    await mkdir(outputRoot, { recursive: true, mode: 0o700 });
    await mkdir(staging, { mode: 0o700 });
    await writeFile(path.join(staging, "schema.sql"), schema.sql, { mode: 0o600 });
    await writeFile(path.join(staging, "seed.sql"), seedSql, { mode: 0o600 });
    await writeFile(path.join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
    const destination = path.join(outputRoot, runId);
    await rename(staging, destination);
    console.log(JSON.stringify({
      outputDirectory: path.relative(root, destination),
      tableCount: manifest.tableCount,
      columnCount: manifest.columnCount,
      foreignKeys: manifest.foreignKeyCount,
      checks: manifest.checkConstraintCount,
      seedCounts: manifest.seedCounts,
      runtimeReady: false,
    }));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    await rm(staging, { recursive: true, force: true });
    // Avoid echoing connection strings, raw queries or row data.
    console.error("MariaDB export failed; no source data was modified.", error instanceof Error ? error.message : "Unknown error");
    process.exitCode = 1;
  } finally {
    client.release();
    await source.end();
  }
}

await main();
