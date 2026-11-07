import { applicationDatabaseDialect } from "@workspace/db/runtime-dialect";
import { verifyApplicationDatabase } from "@workspace/db";
import { hostingerConfig } from "./lib/hostinger-config";
import { logger } from "./lib/logger";
import { initializeLocalStorage } from "./lib/local-storage/service";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import {access} from "node:fs/promises";
import {constants} from "node:fs";

/**
 * Hostinger Node.js entry. Fail BEFORE importing routes/jobs or the legacy
 * database singleton; never start a PostgreSQL application on a MariaDB URL.
 */
async function main(): Promise<void> {
  const config = hostingerConfig(process.env, applicationDatabaseDialect);
  process.env.FRONTEND_DIST_DIR = config.frontendDirectory;
  await initializeLocalStorage();
  const videoBinary=process.env.FFMPEG_PATH??ffmpegPath;
  if(!videoBinary)throw new Error("Hostinger preflight failed: video encoder missing.");
  await access(videoBinary,constants.X_OK);
  ffmpeg.setFfmpegPath(videoBinary);
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
