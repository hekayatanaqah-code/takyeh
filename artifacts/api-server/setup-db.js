import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));

// Reviewed DDL only; never import seed.sql or legacy data-repair scripts here.
export function splitSql(source) {
  const statements = [];
  let statement = "", quote = null;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (!quote && char === "-" && source[i + 1] === "-" && /\s/.test(source[i + 2] ?? "")) {
      while (i < source.length && source[i] !== "\n") i++;
      statement += "\n";
      continue;
    }
    if (quote) {
      statement += char;
      if (char === quote) {
        if (source[i + 1] === quote) statement += source[++i];
        else quote = null;
      }
    } else if ("'\"`".includes(char)) {
      quote = char;
      statement += char;
    } else if (char === ";") {
      if (statement.trim()) statements.push(statement.trim());
      statement = "";
    } else statement += char;
  }
  if (quote) throw new Error("Unterminated SQL string");
  if (statement.trim()) statements.push(statement.trim());
  return statements;
}

export async function prepareDatabase(connection, schemaDirectory = new URL("./database/", import.meta.url)) {
  const [[version]] = await connection.query("SELECT VERSION() AS version");
  if (!/MariaDB/i.test(version.version)) throw new Error("MariaDB is required");
  const [[lock]] = await connection.query(
    "SELECT GET_LOCK(CONCAT('takyeh:setup:', LEFT(SHA2(DATABASE(),256),32)),60) AS acquired",
  );
  if (Number(lock.acquired) !== 1) throw new Error("Database setup is already running");
  try {
    for (const filename of ["schema.sql", "001-application-contract.sql", "002-transaction-mutex.sql"]) {
      const sql = await readFile(new URL(filename, schemaDirectory), "utf8");
      for (const statement of splitSql(sql)) {
        if (/^SET\s/i.test(statement)) {
          await connection.query(statement);
        } else if (/^CREATE TABLE\s/i.test(statement)) {
          await connection.query(statement.replace(/^CREATE TABLE\s+(?:IF NOT EXISTS\s+)?/i, "CREATE TABLE IF NOT EXISTS "));
        } else {
          const foreignKey = statement.match(/^ALTER TABLE `(\w+)` ADD CONSTRAINT `(\w+)` FOREIGN KEY /);
          const column = statement.match(/^ALTER TABLE `?(\w+)`? ADD COLUMN `?(\w+)`? /);
          if (foreignKey) {
            const [existing] = await connection.execute(
              "SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? AND CONSTRAINT_TYPE='FOREIGN KEY'",
              [foreignKey[1], foreignKey[2]],
            );
            if (!existing.length) await connection.query(statement);
          } else if (column) {
            const [existing] = await connection.execute(
              "SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?",
              [column[1], column[2]],
            );
            if (!existing.length) await connection.query(statement);
          } else if (/^INSERT INTO `?application_transaction_mutex`?\s/i.test(statement)) {
            // Populate missing lock buckets, without deleting/replacing active rows.
            const values = Array.from({ length: 4096 }, (_, id) => `(${id})`).join(",");
            await connection.query(
              `INSERT INTO application_transaction_mutex (id) VALUES ${values} ON DUPLICATE KEY UPDATE id=VALUES(id)`,
            );
          } else throw new Error(`Unrecognized setup statement in ${filename}`);
        }
      }
    }
    const [[count]] = await connection.query(
      "SELECT COUNT(*) AS total FROM application_transaction_mutex WHERE id BETWEEN 0 AND 10",
    );
    if (Number(count.total) !== 11) throw new Error("Required mutex rows are missing");
  } finally {
    await connection.query("SELECT RELEASE_LOCK(CONCAT('takyeh:setup:', LEFT(SHA2(DATABASE(),256),32)))");
  }
}

export async function setupDatabase() {
  try { process.loadEnvFile(new URL(".env", import.meta.url)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const url = new URL(process.env.MARIADB_DATABASE_URL ?? "");
  if (url.protocol !== "mysql:" || !url.pathname.slice(1)) throw new Error("MariaDB connection is not configured");
  const connection = await mysql.createConnection({
    uri: url.toString(),
    charset: "utf8mb4",
    multipleStatements: false,
  });
  try {
    await prepareDatabase(connection);
    console.log("تم تجهيز جداول قاعدة البيانات وصفوف أقفال المعاملات بنجاح دون حذف البيانات.");
  } finally { await connection.end(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setupDatabase().catch(error => {
    // Never log SQL payloads, connection URLs, credentials or table contents.
    console.error(`تعذر تجهيز قاعدة البيانات؛ تم إيقاف التشغيل. رمز الخطأ: ${/^[A-Z0-9_]+$/.test(error.code ?? "") ? error.code : "DB_SETUP_FAILED"}`);
    process.exitCode = 1;
  });
}
