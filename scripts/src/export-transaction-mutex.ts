import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, writeFile } from "node:fs/promises";
import { transactionMutexDDL, transactionMutexSeedSQL } from "@workspace/db/transaction-lock";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const directory = path.join(root, ".local/mariadb-runtime");
await mkdir(directory, { recursive: true, mode: 0o700 });
await writeFile(path.join(directory, "002-transaction-mutex.sql"), [
  "-- Apply on the new MariaDB database, before accepting traffic.",
  "-- Technical mutex rows only; no bookings, users or financial seed.",
  "-- Stop all old writers before switching locking protocols.",
  `${transactionMutexDDL.replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")} ENGINE=InnoDB;`,
  `${transactionMutexSeedSQL} ON DUPLICATE KEY UPDATE id=VALUES(id);`,
  "",
].join("\n"), { mode: 0o600 });
console.log("Created .local/mariadb-runtime/002-transaction-mutex.sql (technical lock metadata only).");
