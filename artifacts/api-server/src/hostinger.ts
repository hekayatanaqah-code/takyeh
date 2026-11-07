import { applicationDatabaseDialect } from "@workspace/db/runtime-dialect";
import { verifyApplicationDatabase } from "@workspace/db";
import { hostingerConfig } from "./lib/hostinger-config";
import { logger } from "./lib/logger";

/**
 * Hostinger Node.js entry. Fail BEFORE importing routes/jobs or the legacy
 * database singleton; never start a PostgreSQL application on a MariaDB URL.
 */
async function main(): Promise<void> {
  const config = hostingerConfig(process.env, applicationDatabaseDialect);
  process.env.FRONTEND_DIST_DIR = config.frontendDirectory;
  await verifyApplicationDatabase();
  await import("./index");
}

main().catch(error => {
  // No driver errors/connection strings in logs; the operator can diagnose the
  // secure connection separately using the migration-verification command.
  logger.error({
    reason: error instanceof Error && error.message.startsWith("Hostinger startup blocked:")
      ? error.message : "Hostinger preflight failed; check secure configuration and migration verification.",
  }, "Hostinger server did not start");
  process.exitCode = 1;
});
