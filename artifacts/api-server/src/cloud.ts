import type { Server } from "node:http";
import { verifyApplicationDatabase, pool } from "@workspace/db";
import { initializeLocalStorage } from "./lib/local-storage/service";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";

/** Provider-neutral runtime. No hosting vendor guards, exported ZIP, or seeding. */
export async function startCloud(server: Server) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    throw new Error("A stable SESSION_SECRET of at least 32 characters is required.");
  }
  // Moving hosts is not authorization to seed accounts or repair old finances.
  process.env.DISABLE_STARTUP_SEEDING = "true";
  await initializeLocalStorage();
  const encoder = process.env.FFMPEG_PATH || ffmpegPath;
  if (encoder) ffmpeg.setFfmpegPath(encoder);
  await verifyApplicationDatabase();
  if (!server.listening) throw new Error("HTTP server closed during initialization.");
  process.env.TAKYEH_EMBEDDED_HTTP = "true";
  const runtime = await import("./index");
  return runtime.attachApplicationServer(server);
}

export async function closeCloudResources() {
  await pool.end();
}
