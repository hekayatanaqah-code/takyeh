import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Only Node built-ins are loaded before binding. No database, image processor,
// framework, or bundle needs to load in order to serve the public frontend.
var root = fileURLToPath(new URL(".", import.meta.url));
var handler = null;
var runtime = null;
var backend = null;
var phase = "starting";
var closing = false;
var server;
var publicDirectory;
var types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf",
  ".pdf": "application/pdf", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8"
};

function log(level, message, code) {
  process.stderr.write(JSON.stringify({ level: level, message: message, code: code }) + "\n");
}
function reply(req, res, status, value) {
  var body = JSON.stringify(value);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
  });
  res.end(req.method === "HEAD" ? undefined : body);
}
function unavailable(req, res) {
  res.setHeader("Retry-After", "5");
  reply(req, res, 503, {
    error: phase === "failed" ? "خدمات المنصة غير متاحة حالياً. يرجى مراجعة إعدادات الخادم." : "يجري تجهيز خدمات المنصة، يرجى المحاولة بعد قليل.",
    code: phase === "failed" ? "BACKEND_UNAVAILABLE" : "BACKEND_STARTING"
  });
}
async function staticFile(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    reply(req, res, 405, { error: "الطريقة غير مسموحة" });
    return;
  }
  // Never route private files or their URL-encoded aliases to the SPA.
  if (pathname.indexOf("\\") !== -1 || pathname.indexOf("\0") !== -1 ||
      pathname.split("/").some(function (part) { return part.charAt(0) === "."; }) ||
      /^\/(?:server|database|private-storage|node_modules|reports)(?:\/|$)/i.test(pathname) ||
      /^\/(?:server\.js|setup-db\.js|package(?:-lock)?\.json|pnpm-lock\.yaml|.*\.sql)$/i.test(pathname)) {
    reply(req, res, 404, { error: "غير موجود" });
    return;
  }
  var base = await fs.promises.realpath(publicDirectory);
  var filename = path.resolve(base, "." + pathname);
  if (filename !== base && filename.indexOf(base + path.sep) !== 0) {
    reply(req, res, 404, { error: "غير موجود" });
    return;
  }
  var stat;
  try {
    filename = await fs.promises.realpath(filename);
    if (filename !== base && filename.indexOf(base + path.sep) !== 0) {
      reply(req, res, 404, { error: "غير موجود" });
      return;
    }
    stat = await fs.promises.stat(filename);
    if (!stat.isFile()) stat = null;
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
  }
  if (!stat) {
    var accepts = String(req.headers.accept || "*/*");
    if (path.extname(pathname) || (accepts.indexOf("text/html") === -1 && accepts.indexOf("*/*") === -1)) {
      reply(req, res, 404, { error: "غير موجود" });
      return;
    }
    filename = await fs.promises.realpath(path.join(base, "index.html"));
    if (filename.indexOf(base + path.sep) !== 0) throw new Error("Invalid frontend index");
    stat = await fs.promises.stat(filename);
  }
  var ext = path.extname(filename).toLowerCase();
  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Content-Length": stat.size,
    "Cache-Control": ext === ".html" || ext === ".webmanifest" || pathname === "/sw.js" ? "no-store" : "public, max-age=3600",
    "X-Content-Type-Options": "nosniff"
  });
  if (req.method === "HEAD") { res.end(); return; }
  var stream = fs.createReadStream(filename);
  stream.on("error", function () { res.destroy(); });
  res.on("close", function () { stream.destroy(); });
  stream.pipe(res);
}
function request(req, res) {
  var pathname;
  try { pathname = decodeURIComponent(String(req.url || "/").split("?")[0]); }
  catch (_) { reply(req, res, 400, { error: "مسار غير صالح" }); return; }
  if (pathname === "/healthz" || pathname === "/readyz") {
    var ready = phase === "ready" && !closing;
    reply(req, res, pathname === "/readyz" && !ready ? 503 : 200, {
      status: closing ? "stopping" : phase, applicationReady: ready
    });
    return;
  }
  if (pathname === "/api" || pathname.indexOf("/api/") === 0) {
    if (handler && !closing) handler(req, res);
    else unavailable(req, res);
    return;
  }
  staticFile(req, res, pathname).catch(function () {
    if (!res.headersSent) reply(req, res, 500, { error: "تعذر تحميل ملفات الواجهة" });
    else res.destroy();
  });
}
async function initialize() {
  try {
    backend = await import(new URL("./server/hostinger.mjs", import.meta.url).href);
    if (closing) { await backend.closeHostingerResources(); return; }
    runtime = await backend.startHostinger(server);
    if (closing) { await runtime.shutdown("startup-cancelled"); return; }
    handler = runtime.handler;
    phase = "ready";
    log("info", "Application backend ready");
  } catch (error) {
    phase = "failed";
    log("error", "Backend initialization failed; frontend remains available. Check database, storage, Node version and configuration.",
      /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "BACKEND_INIT_FAILED");
    if (backend && backend.closeHostingerResources) {
      try { await backend.closeHostingerResources(); } catch (_) {}
    }
  }
}
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  handler = null;
  var deadline = setTimeout(function () { process.exit(1); }, 25000);
  deadline.unref();
  try {
    if (runtime) await runtime.shutdown(signal);
    else {
      await new Promise(function (resolve) {
        server.close(resolve);
        server.closeIdleConnections();
      });
      if (backend && backend.closeHostingerResources) await backend.closeHostingerResources();
    }
    clearTimeout(deadline);
  } catch (_) { process.exitCode = 1; }
}
function main() {
  try {
    log("info", "Hostinger launcher starting", "NODE_" + process.versions.node);
    process.chdir(root);
    try { process.loadEnvFile(path.join(root, ".env")); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
    if (!process.env.PORT) process.env.PORT = "3000";
    if (!/^\d+$/.test(process.env.PORT) || Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535) {
      var portError = new Error("Invalid PORT");
      portError.code = "INVALID_PORT";
      throw portError;
    }
    publicDirectory = path.resolve(root, process.env.FRONTEND_DIST_DIR || "public");
    process.env.FRONTEND_DIST_DIR = publicDirectory;
    server = http.createServer(request);
    server.once("error", function (error) {
      closing = true;
      log("error", "HTTP listener failed", error.code);
      process.exitCode = 1;
    });
    process.once("SIGTERM", function () { shutdown("SIGTERM"); });
    process.once("SIGINT", function () { shutdown("SIGINT"); });
    server.listen(Number(process.env.PORT), "0.0.0.0", function () {
      log("info", "Native HTTP listener ready on 0.0.0.0:" + process.env.PORT);
      initialize();
    });
  } catch (error) {
    log("error", "Hostinger launcher failed; check Node version and configuration",
      /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "LAUNCHER_FAILED");
    process.exitCode = 1;
  }
}
main();
