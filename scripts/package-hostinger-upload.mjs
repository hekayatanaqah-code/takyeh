import { readdir, readFile, writeFile, mkdir, cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

// Upload only the prebuilt application. Never include the private seed, media
// export, test reports, credentials, node_modules, or an enclosing app directory.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "generated-artifacts/hostinger");
const source = path.join(output, "takyeh-hostinger/app");
const staging = path.join(output, "upload-app");
await rm(staging, { recursive: true, force: true });
await mkdir(staging, { recursive: true, mode: 0o700 });
for (const name of ["server", "public", "database", "pnpm-lock.yaml", ".env.example"]) {
  await cp(path.join(source, name), path.join(staging, name), { recursive: true });
}
for (const [from, to] of [["hostinger-start.mjs", "launcher.mjs"], ["hostinger-entry.cjs", "server.cjs"],
  ["setup-db.js", "setup-db.js"], ["hostinger-deploy-check.mjs", "deploy-check.mjs"]]) {
  await cp(path.join(root, "artifacts/api-server", from), path.join(staging, to));
}
const manifest = JSON.parse(await readFile(path.join(source, "package.json"), "utf8"));
manifest.scripts.build = "node deploy-check.mjs";
manifest.scripts.start = "node server.cjs";
manifest.main = "server.cjs";
await writeFile(path.join(staging, "server.js"), 'import "./server.cjs";\n');
await writeFile(path.join(staging, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
await cp(path.join(root, "docs/hostinger-install-ar.md"), path.join(staging, "HOSTINGER-README.md"));
const files = [];
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Symlink in upload.");
    if (/^(?:\.env|seed\.sql|node_modules|private-storage)$/i.test(entry.name)) throw new Error("Private file in upload.");
    if (entry.isDirectory()) await inspect(filename);
    else files.push({ path: path.relative(staging, filename),
      sha256: createHash("sha256").update(await readFile(filename)).digest("hex") });
  }
}
await inspect(staging);
await writeFile(path.join(staging, "release-files.json"), JSON.stringify({
  createdAt: new Date().toISOString(), hostingerLiveVerified: false, files,
}, null, 2));
const archive = path.join(output, "takyeh-hostinger-upload.zip");
await rm(archive, { force: true });
execFileSync("zip", ["-q", "-r", archive, "."], { cwd: staging });
const bytes = await readFile(archive);
await writeFile(archive + ".sha256", createHash("sha256").update(bytes).digest("hex") + "  " + path.basename(archive) + "\n");
console.log(JSON.stringify({ archive: path.relative(root, archive), files: files.length, size: bytes.length,
  applicationRoot: ".", entryFile: "server.cjs", databaseIncluded: "schema only; no settings/admin seed" }));
