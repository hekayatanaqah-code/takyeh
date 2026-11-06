import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.MARIADB_DATABASE_URL;
if (!url || !url.startsWith("mysql://")) {
  throw new Error("Configure MARIADB_DATABASE_URL securely; PostgreSQL DATABASE_URL is never reused.");
}
const directory = path.dirname(fileURLToPath(import.meta.url));

// Manual/offline generation only. Do not automatically push to a populated host.
export default defineConfig({
  dialect: "mysql",
  schema: path.join(directory, "src/mariadb/schema/index.ts"),
  out: path.resolve(directory, "../../.local/mariadb-drizzle-migrations"),
  dbCredentials: { url },
  strict: true,
  verbose: false,
});
