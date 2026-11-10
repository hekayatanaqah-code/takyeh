"use strict";

// Standard Node.js entry for a single frontend + API web service.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const root = __dirname;
if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
if (!process.env.PORT) process.env.PORT = "3000";
if (!/^\d+$/.test(process.env.PORT) || Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535) {
  console.error("Invalid PORT: supply an integer between 1 and 65535.");
  process.exit(1);
}

// Resolve runtime dependencies from the API workspace rather than a ZIP export.
const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
const express = apiRequire("express");
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);
const publicDirectory = path.resolve(root, process.env.FRONTEND_DIST_DIR ||
  (fs.existsSync(path.join(root, "public/index.html")) ? "public" : "artifacts/chalet-marketplace/dist/public"));
const backendFile = path.join(root, "artifacts/api-server/dist-cloud/cloud.mjs");
process.env.FRONTEND_DIST_DIR = publicDirectory;
let runtime;
let backend;
let state = "starting";
let stopping = false;

app.get("/healthz", (_req, res) => {
  res.set("Cache-Control", "no-store").json({ status: stopping ? "stopping" : state });
});
app.get("/readyz", (_req, res) => {
  const ready = state === "ready" && !stopping;
  res.status(ready ? 200 : 503).set("Cache-Control", "no-store").json({ applicationReady: ready, status: state });
});
app.use((req, res, next) => {
  if (req.path !== "/api" && !req.path.startsWith("/api/")) return next();
  if (runtime && !stopping) return runtime.handler(req, res);
  res.status(503).set({ "Cache-Control": "no-store", "Retry-After": "5" }).json({
    error: state === "failed" ? "خدمات المنصة غير متاحة حالياً." : "يجري تجهيز خدمات المنصة.",
    code: state === "failed" ? "BACKEND_UNAVAILABLE" : "BACKEND_STARTING"
  });
});
app.use((req, res, next) => {
  let pathname;
  try { pathname = decodeURIComponent(req.path); }
  catch (_) { return res.sendStatus(400); }
  if (pathname.includes("\\") || pathname.split("/").some(part => part.startsWith(".")) ||
      /^\/(?:server|database|node_modules|generated-artifacts|private-storage|artifacts|scripts)(?:\/|$)/i.test(pathname)) {
    return res.sendStatus(404);
  }
  next();
});
app.use(express.static(publicDirectory, {
  dotfiles: "deny", index: false, redirect: false,
  setHeaders(res) { res.setHeader("Cache-Control", "no-cache"); res.setHeader("X-Content-Type-Options", "nosniff"); }
}));
app.get("/{*page}", (req, res, next) => {
  if (path.extname(req.path) || !req.accepts("html")) return next();
  res.set("Cache-Control", "no-store").sendFile(path.join(publicDirectory, "index.html"));
});
app.use((_req, res) => res.sendStatus(404));

const server = http.createServer(app);
server.once("error", error => {
  console.error("HTTP listener failed:", error.code || "LISTEN_FAILED");
  process.exitCode = 1;
});
server.listen(Number(process.env.PORT), "0.0.0.0", () => {
  console.log("HTTP listening on 0.0.0.0:" + process.env.PORT);
  import(pathToFileURL(backendFile).href).then(async module => {
    backend = module;
    if (stopping) return module.closeCloudResources();
    runtime = await module.startCloud(server);
    if (stopping) return runtime.shutdown("startup-cancelled");
    state = "ready";
    console.log("Application backend ready");
  }).catch(async error => {
    state = "failed";
    console.error("Backend startup failed. Check build output, database and storage configuration.",
      /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "BACKEND_INIT_FAILED");
    if (backend) await backend.closeCloudResources().catch(() => undefined);
  });
});
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 25000);
  deadline.unref();
  try {
    if (runtime) await runtime.shutdown(signal);
    else {
      await new Promise(resolve => { server.close(resolve); server.closeIdleConnections(); });
      if (backend) await backend.closeCloudResources();
    }
    clearTimeout(deadline);
  } catch (_) { process.exitCode = 1; }
}
process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
