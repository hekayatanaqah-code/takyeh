import { applicationDatabaseDialect } from "@workspace/db/runtime-dialect";
import { verifyApplicationDatabase, pool } from "@workspace/db";
import { hostingerConfig } from "./lib/hostinger-config";
import { logger } from "./lib/logger";
import { initializeLocalStorage } from "./lib/local-storage/service";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import {access} from "node:fs/promises";
import {constants} from "node:fs";
import {fileURLToPath} from "node:url";
import type { Server } from "node:http";

/**
 * Hostinger Node.js entry. Fail BEFORE importing routes/jobs or the legacy
 * database singleton; never start a PostgreSQL application on a MariaDB URL.
 */
export async function startHostinger(server: Server) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  process.chdir(root);
  logger.info({ stage: "configuration" }, "Hostinger backend initialization");
  let config: ReturnType<typeof hostingerConfig>;
  try {
    config = hostingerConfig(process.env, applicationDatabaseDialect, root);
  } catch (error) {
    throw new Error(`Hostinger startup blocked: ${error instanceof Error ? error.message : "Invalid configuration."}`);
  }
  process.env.FRONTEND_DIST_DIR = config.frontendDirectory;
  // Optional schema-only setup runs AFTER the public listener is bound, never
  // before it. No account/configuration seed or historical repairs are replayed.
  if (process.env.TAKYEH_AUTO_SETUP_DB !== "false") {
    logger.info({ stage: "database-schema" }, "Preparing database after HTTP binding");
    const setupUrl = new URL("../setup-db.js", import.meta.url).href;
    const setup = await import(setupUrl);
    await setup.setupDatabase();
  }
  logger.info({ stage: "storage" }, "Hostinger backend initialization");
  await initializeLocalStorage();
  const videoBinary=process.env.FFMPEG_PATH??ffmpegPath;
  if(!videoBinary)throw new Error("Hostinger preflight failed: video encoder missing.");
  await access(videoBinary,constants.X_OK);
  ffmpeg.setFfmpegPath(videoBinary);
  logger.info({ stage: "database-verification" }, "Hostinger backend initialization");
  await verifyApplicationDatabase();
  if (!server.listening) {
    await pool.end();
    throw new Error("HTTP listener was closed during initialization");
  }
  process.env.TAKYEH_EMBEDDED_HTTP = "true";
  const runtime = await import("./index");
  return runtime.attachApplicationServer(server);
}

export async function closeHostingerResources() {
  await pool.end();
}
