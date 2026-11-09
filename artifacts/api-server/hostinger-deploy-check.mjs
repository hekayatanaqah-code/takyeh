import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

// This check deliberately never loads application code or connects to a database.
const root = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(import.meta.url);
const failures = [];
const version = process.versions.node.split(".").map(Number);
if (!((version[0] === 22 && version[1] >= 9) || version[0] === 24)) {
  failures.push("Select Node.js 22.9+ (22.x) or 24.x in Hostinger.");
}
for (const name of ["server.js", "setup-db.js", "server/hostinger.mjs", "public/index.html",
  "database/schema.sql", "database/001-application-contract.sql", "database/002-transaction-mutex.sql"]) {
  if (!fs.existsSync(path.join(root, name))) failures.push("Missing release file: " + name);
}
for (const name of ["server.js", "setup-db.js", "server/hostinger.mjs"]) {
  if (!fs.existsSync(path.join(root, name))) continue;
  const result = spawnSync(process.execPath, ["--check", path.join(root, name)], { encoding: "utf8" });
  if (result.status !== 0) failures.push("Syntax check failed: " + name);
}
const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
for (const name of Object.keys(manifest.dependencies || {})) {
  try { require.resolve(name); }
  catch (_) { failures.push("Dependency not installed: " + name + ". Install production dependencies first."); }
}
if (fs.existsSync(path.join(root, "public/index.html"))) {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  for (const match of html.matchAll(/(?:src|href)=["'](\/assets\/[^"'?#]+)(?:[?#][^"']*)?["']/g)) {
    const filename = path.resolve(root, "public", "." + match[1]);
    if (!filename.startsWith(path.join(root, "public") + path.sep) || !fs.existsSync(filename)) {
      failures.push("Missing frontend asset: " + match[1]);
    }
  }
}
if (failures.length) {
  for (const failure of failures) console.error("[deploy-check] " + failure);
  process.exitCode = 1;
} else {
  console.log("[deploy-check] Release files, Node version, syntax and dependency resolution passed.");
  console.log("[deploy-check] No database connection or data changes performed. Runtime readiness must be checked separately.");
}
