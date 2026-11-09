"use strict";

// Host loaders may require() the entry file and inspect listen() immediately.
// Keep that call synchronous: no ESM import, database, or dependency before it.
var http = require("http");
var fs = require("fs");
var path = require("path");
var root = __dirname;
var server;
function log(message, code) {
  process.stderr.write(JSON.stringify({ message: message, code: code }) + "\n");
}
function pending(req, res) {
  res.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "3" });
  res.end(req.method === "HEAD" ? undefined : JSON.stringify({
    error: "يجري تحميل التطبيق، يرجى المحاولة بعد قليل.", code: "LAUNCHER_STARTING"
  }));
}
try {
  log("CommonJS entry loaded; calling listen synchronously", "CJS_ENTRY");
  process.chdir(root);
  if (fs.existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
  if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
  if (!process.env.PORT) process.env.PORT = "3000";
  if (!/^\d+$/.test(process.env.PORT) || Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535) {
    var error = new Error("Invalid PORT");
    error.code = "INVALID_PORT";
    throw error;
  }
  process.env.FRONTEND_DIST_DIR = path.resolve(root, process.env.FRONTEND_DIST_DIR || "public");
  server = http.createServer(pending);
  server.once("error", function (error) {
    log("HTTP listener failed", error.code);
    process.exitCode = 1;
  });
  // Deliberately unconditional: never wrap this in require.main === module.
  server.listen(Number(process.env.PORT), "0.0.0.0", function () {
    log("Native HTTP listener ready on 0.0.0.0:" + process.env.PORT, "HTTP_LISTENING");
    import("./launcher.mjs").then(function (launcher) {
      launcher.attachNativeServer(server, pending);
    }).catch(function () {
      log("Launcher module could not load; verify release files and Node version", "LAUNCHER_IMPORT_FAILED");
      server.removeListener("request", pending);
      server.on("request", function (req, res) {
        res.writeHead(503, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: "تعذر تحميل التطبيق.", code: "LAUNCHER_IMPORT_FAILED" }));
      });
    });
  });
} catch (error) {
  log("Entry failed; check Node version, PORT and local environment file",
    /^[A-Z0-9_]+$/.test(error.code || "") ? error.code : "ENTRY_FAILED");
  process.exitCode = 1;
}
