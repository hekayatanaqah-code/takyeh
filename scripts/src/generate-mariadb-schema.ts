import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { readCatalog } from "./mariadb/read-catalog";
import { buildSchema } from "./mariadb/schema-converter";
import { generateDrizzleSchemas } from "./mariadb/drizzle-generator";

const url = process.env.DATABASE_URL;
if (!url || !/^postgres(ql)?:/.test(url)) throw new Error("A PostgreSQL source is required.");
const output = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../lib/db/src/mariadb/schema");
const pool = new pg.Pool({ connectionString: url, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const catalog = await readCatalog(client);
  buildSchema(catalog); // Same strict compatibility gates as the SQL exporter.
  const files = generateDrizzleSchemas(catalog);
  await client.query("COMMIT");
  await mkdir(output, { recursive: true });
  const existing = await readdir(output);
  if (existing.some(file => !files.has(file))) {
    throw new Error("Unexpected native schema files; refusing to remove or silently retain stale tables.");
  }
  for (const [name, content] of files) await writeFile(path.join(output, name), content);
  console.log(`Generated ${files.size - 1} native MariaDB table definitions. PostgreSQL API imports unchanged.`);
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  client.release();
  await pool.end();
}
