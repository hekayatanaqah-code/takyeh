import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { attachFrontend } from "./frontend-static";

test("single Express service serves SPA, assets and API without leaking private files", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "takyeh-static-test-"));
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    await mkdir(path.join(directory, "assets"));
    await mkdir(path.join(directory, ".private"));
    await writeFile(path.join(directory, "index.html"), "<html><body>واجهة تكيّة</body></html>");
    await writeFile(path.join(directory, "assets/app-abcd1234.js"), "window.fixture = true;");
    await writeFile(path.join(directory, ".private/seed.sql"), "must never be served");
    const app = express();
    app.get("/api/test", (_req, res) => { res.json({ ok: true }); });
    attachFrontend(app, directory);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => { server!.once("listening", resolve); server!.once("error", reject); });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}`;
    const api = await fetch(`${base}/api/test`);
    assert.deepEqual(await api.json(), { ok: true });
    const missingApi = await fetch(`${base}/api/missing`, { headers: { accept: "text/html" } });
    assert.equal(missingApi.status, 404);
    assert.match(missingApi.headers.get("content-type") ?? "", /json/);
    const page = await fetch(`${base}/owner/subscriptions`, { headers: { accept: "text/html" } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /واجهة تكيّة/);
    assert.equal(page.headers.get("cache-control"), "no-store");
    const asset = await fetch(`${base}/assets/app-abcd1234.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get("cache-control") ?? "", /immutable/);
    assert.equal((await fetch(`${base}/assets/missing.js`)).status, 404);
    assert.equal((await fetch(`${base}/.private/seed.sql`)).status, 404);
    assert.equal((await fetch(`${base}/%2Eprivate/seed.sql`)).status, 404);
    assert.equal((await fetch(`${base}/.env`)).status, 404);
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
