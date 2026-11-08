import { fileURLToPath } from "node:url";

// Kept dependency-free: load configuration before importing the database/app.
const root = fileURLToPath(new URL(".", import.meta.url));
try {
  process.chdir(root);
  try {
    process.loadEnvFile(fileURLToPath(new URL(".env", import.meta.url)));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  // Environment supplied by the hosting service takes precedence over .env.
  process.env.NODE_ENV ??= "production";
  process.env.FRONTEND_DIST_DIR ??= fileURLToPath(new URL("./public/", import.meta.url));
  await import(new URL("./server/hostinger.mjs", import.meta.url).href);
} catch {
  process.stderr.write('{"level":"error","message":"Hostinger launcher failed; check Node.js version, configuration and installed server files."}\n');
  process.exitCode = 1;
}
