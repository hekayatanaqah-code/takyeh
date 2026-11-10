"use strict";

// Root entry for the prebuilt, full-function Hostinger release.
// The release's server.cjs binds synchronously, then loads its backend.
var fs = require("fs");
var path = require("path");
var candidates = [
  path.join(__dirname, "generated-artifacts", "hostinger", "upload-app"),
  path.join(__dirname, "generated-artifacts", "hostinger", "takyeh-hostinger", "app")
];
var applicationRoot = candidates.find(function (directory) {
  return fs.existsSync(path.join(directory, "server.cjs")) &&
    fs.existsSync(path.join(directory, "launcher.mjs")) &&
    fs.existsSync(path.join(directory, "public", "index.html"));
});

if (!applicationRoot) {
  console.error("HOSTINGER_RELEASE_MISSING: Prepare the prebuilt release with node scripts/package-hostinger-upload.mjs. Upload the contents of that release, not the workspace monorepo.");
  process.exitCode = 1;
} else {
  // Prefer a public directory next to this root entry when supplied.
  // Otherwise use the public directory in the verified Hostinger release.
  if (!process.env.FRONTEND_DIST_DIR) {
    process.env.FRONTEND_DIST_DIR = fs.existsSync(path.join(__dirname, "public", "index.html"))
      ? path.join(__dirname, "public")
      : path.join(applicationRoot, "public");
  }
  // No require.main guard: Hostinger must observe listen during module loading.
  require(path.join(applicationRoot, "server.cjs"));
}
