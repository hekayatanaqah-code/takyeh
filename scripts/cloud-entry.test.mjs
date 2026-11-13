import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, writeFile, symlink, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const workspace = fileURLToPath(new URL("../", import.meta.url));
async function fixture(failed = false, frontendDirectory = "dist") {
  const directory = await mkdtemp(path.join(tmpdir(), "takyeh-cloud-"));
  await mkdir(path.join(directory, "artifacts/api-server/dist-cloud"), { recursive: true });
  await mkdir(path.join(directory, frontendDirectory), { recursive: true });
  // A stale legacy public/ directory must not override the new dist build.
  if (frontendDirectory !== "public") {
    await mkdir(path.join(directory, "public"));
    await writeFile(path.join(directory, "public/index.html"), "<h1>stale build</h1>");
  }
  await writeFile(path.join(directory, "artifacts/api-server/package.json"), "{}");
  await symlink(path.join(workspace, "artifacts/api-server/node_modules"), path.join(directory, "artifacts/api-server/node_modules"));
  await cp(path.join(workspace, "server.cjs"), path.join(directory, "server.cjs"));
  await writeFile(path.join(directory, frontendDirectory, "index.html"), "<h1>تكيّة</h1>");
  await writeFile(path.join(directory, frontendDirectory, "app.js"), "window.ready=true;");
  await writeFile(path.join(directory, "artifacts/api-server/dist-cloud/cloud.mjs"), failed
    ? 'export async function startCloud(){throw new Error("private fixture");} export async function closeCloudResources(){}'
    : `export async function startCloud(server){
      return {handler(req,res){res.setHeader("Content-Type","application/json");res.end(JSON.stringify({url:req.url}));},
      shutdown(){return new Promise(resolve=>{server.close(resolve);server.closeIdleConnections();});}};
    } export async function closeCloudResources(){}`);
  const socket = createServer(); socket.listen(0, "127.0.0.1"); await once(socket, "listening");
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, [path.join(directory, "server.cjs")], {
    cwd: tmpdir(), env: {
      PATH: process.env.PATH, PORT: String(port),
      ...(frontendDirectory === "dist" ? {} : { FRONTEND_DIST_DIR: frontendDirectory }),
    }, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = ""; child.stdout.on("data", data => { logs += data; }); child.stderr.on("data", data => { logs += data; });
  const base = "http://127.0.0.1:" + port;
  for (let i = 0; i < 100; i++) {
    try {
      const status = await (await fetch(base + "/healthz")).json();
      if (status.status === (failed ? "failed" : "ready")) return { directory, child, base, logs: () => logs };
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  child.kill("SIGKILL"); await rm(directory, { recursive: true, force: true });
  throw new Error("Cloud fixture timed out: " + logs);
}
async function cleanup(item) {
  const done = once(item.child, "exit");
  item.child.kill("SIGTERM");
  const deadline = setTimeout(() => item.child.kill("SIGKILL"), 4000);
  try { await done; } finally { clearTimeout(deadline); await rm(item.directory, { recursive: true, force: true }); }
}
test("generic cloud entry serves root dist SPA and API without stale public files", async () => {
  const item = await fixture();
  try {
    assert.equal((await fetch(item.base + "/readyz")).status, 200);
    assert.match(await (await fetch(item.base + "/index.html")).text(), /تكيّة/);
    assert.match(await (await fetch(item.base + "/admin")).text(), /تكيّة/);
    assert.equal(await (await fetch(item.base + "/app.js")).text(), "window.ready=true;");
    assert.equal((await fetch(item.base + "/app.js", { method: "HEAD" })).status, 200);
    assert.equal((await fetch(item.base + "/missing.js")).status, 404);
    assert.deepEqual(await (await fetch(item.base + "/api/test?x=1")).json(), { url: "/api/test?x=1" });
    // A cloud-only sender used to bypass persistence and made every OTP invalid.
    for (const endpoint of ["/api/send-phone-otp", "/api/owner/send-otp", "/api/resend-phone-otp", "/api/verify-phone-otp"]) {
      const response = await fetch(item.base + endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "otp-fixture@example.invalid" }),
      });
      assert.deepEqual(await response.json(), { url: endpoint });
    }
    for (const p of ["/.env", "/server.cjs", "/artifacts/api-server/package.json", "/database/schema.sql"]) {
      assert.equal((await fetch(item.base + p)).status, 404);
    }
  } finally { await cleanup(item); }
});
test("an explicit frontend directory override still serves SPA and assets", async () => {
  const item = await fixture(false, "custom/public");
  try {
    assert.match(await (await fetch(item.base + "/admin")).text(), /تكيّة/);
    assert.equal((await fetch(item.base + "/app.js")).status, 200);
  } finally { await cleanup(item); }
});
test("cloud backend failure leaves public frontend available and readiness honestly fails", async () => {
  const item = await fixture(true);
  try {
    assert.equal((await fetch(item.base + "/")).status, 200);
    assert.equal((await fetch(item.base + "/readyz")).status, 503);
    const api = await fetch(item.base + "/api/test");
    assert.equal(api.status, 503);
    assert.equal((await api.json()).code, "BACKEND_UNAVAILABLE");
    assert.doesNotMatch(item.logs(), /private fixture/);
  } finally { await cleanup(item); }
});
