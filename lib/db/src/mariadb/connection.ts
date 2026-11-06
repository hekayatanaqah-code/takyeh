import mysql, { type PoolOptions } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";

/**
 * Native MariaDB connector for migration tooling and the future MariaDB backend.
 * It is NOT a PostgreSQL SQL translator and must not be substituted into existing
 * PostgreSQL routes. No fallback to the development PostgreSQL connection.
 */
export function createMariaDbConnection(options: {
  url?: string;
  socketPath?: string;
  database?: string;
  user?: string;
} = {}) {
  const url = options.url ?? process.env.MARIADB_DATABASE_URL;
  let config: PoolOptions;
  if (options.socketPath) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local socket test connections are disabled in production.");
    }
    config = { socketPath: options.socketPath, database: options.database, user: options.user };
  } else {
    if (!url) throw new Error("MARIADB_DATABASE_URL must be configured securely.");
    const parsed = new URL(url);
    if (parsed.protocol !== "mysql:" || !parsed.pathname || parsed.pathname === "/") {
      throw new Error("MARIADB_DATABASE_URL must use mysql:// and include a database name.");
    }
    // Passing the URI preserves mysql2's supported TLS/query options.
    config = { uri: url };
  }
  const pool = mysql.createPool({
    ...config,
    charset: "utf8mb4",
    timezone: "Z",
    supportBigNumbers: true,
    bigNumberStrings: true,
    decimalNumbers: false,
    multipleStatements: false,
    connectionLimit: 5,
  });
  pool.pool.on("connection", connection => {
    connection.query("SET time_zone = '+00:00'", error => {
      // Never retain a connection whose timestamp session could not initialize.
      if (error) connection.destroy();
    });
  });
  const db = drizzle(pool, { mode: "default" });
  return {
    pool,
    db,
    async verifyTarget() {
      const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT VERSION() AS version");
      const version = String(rows[0]?.version ?? "");
      if (!/^10\.11\.\d+.*MariaDB/i.test(version)) {
        throw new Error("The migration target must be MariaDB 10.11.");
      }
      await db.execute(sql`SELECT 1 AS native_drizzle_ready`);
      return { version, dialect: "mysql" as const };
    },
    close: () => pool.end(),
  };
}
