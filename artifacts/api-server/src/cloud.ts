import type { Server } from "node:http";
import { verifyApplicationDatabase, pool } from "@workspace/db";
import { initializeLocalStorage } from "./lib/local-storage/service";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

/** PostgreSQL cloud runtime. No hosting vendor guards, exported ZIP, or seeding. */
export async function startCloud(server: Server) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("A stable SESSION_SECRET of at least 32 characters is required.");
  }
  // Moving hosts is not authorization to seed accounts or repair old finances.
  process.env.DISABLE_STARTUP_SEEDING = "true";
  // Verify the selected database independently of local-file provisioning.
  // This does not create tables, copy records or run historical repairs.
  await verifyApplicationDatabase();
  try {
    await initializeLocalStorage();
  } catch {
    const error = new Error("Private persistent storage must be configured before startup.");
    Object.assign(error, { code: "CLOUD_STORAGE_NOT_READY" });
    throw error;
  }
  const encoder = process.env.FFMPEG_PATH || ffmpegPath;
  if (encoder) ffmpeg.setFfmpegPath(encoder);
  if (!server.listening) throw new Error("HTTP server closed during initialization.");
  process.env.TAKYEH_EMBEDDED_HTTP = "true";
  const runtime = await import("./index");
  return runtime.attachApplicationServer(server);
}

export async function closeCloudResources() {
  await pool.end();
}
