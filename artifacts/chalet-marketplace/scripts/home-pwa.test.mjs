import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("public/manifest.json", root), "utf8"));
const worker = await readFile(new URL("public/sw.js", root), "utf8");
const registration = await readFile(new URL("src/lib/home-pwa.ts", root), "utf8");

test("Arabic standalone manifest opens home and supplies real PNG install icons", async () => {
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.dir, "rtl");
  assert.equal(manifest.lang, "ar-SA");
  assert.ok(manifest.icons.some(icon => icon.sizes === "192x192" && icon.purpose === "any"));
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.purpose === "any"));
  assert.ok(manifest.icons.some(icon => icon.purpose === "maskable"));
  for (const icon of [...manifest.icons, { src: "icons/apple-touch-icon.png", sizes: "180x180" }]) {
    const png = await readFile(new URL(`public/${icon.src}`, root));
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes);
  }
});

test("worker registration starts only at home, supports a base prefix and requires a secure context", async () => {
  for (const [base, pathname, secure, expected] of [
    ["/", "/", true, 1], ["/", "/dashboard", true, 0], ["/", "/login", true, 0],
    ["/", "/", false, 0], ["/market/", "/market/", true, 1],
    ["/market/", "/market", true, 1], ["/market/", "/market/dashboard", true, 0],
  ]) {
    const calls = [];
    const context = vm.createContext({
      URL, console, window: { isSecureContext: secure, location: { origin: "https://example.invalid", pathname } },
      navigator: { serviceWorker: { register: async (...args) => calls.push(args) } },
    });
    vm.runInContext(registration.replace("export async function", "async function")
      .replace("import.meta.env.BASE_URL", JSON.stringify(base)), context);
    await context.registerHomePwa();
    assert.equal(calls.length, expected, pathname);
    if (expected) {
      assert.equal(calls[0][0].href, `https://example.invalid${base}sw.js`);
      assert.equal(calls[0][1].scope, base);
      assert.equal(calls[0][1].updateViaCache, "none");
    }
  }
});

function simulateWorker(fetch) {
  const handlers = new Map();
  vm.runInNewContext(worker, {
    URL, Response, fetch, self: {
      registration: { scope: "https://example.invalid/" },
      addEventListener: (name, handler) => handlers.set(name, handler),
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
  });
  return request => {
    let response;
    handlers.get("fetch")({ request, respondWith: promise => { response = promise; } });
    return response;
  };
}
test("home always uses the live network; offline fallback is Arabic and explicitly unavailable", async () => {
  const request = { url: "https://example.invalid/", mode: "navigate", method: "GET" };
  const live = new Response("live homepage");
  assert.equal(await simulateWorker(async () => live)(request), live);
  const offline = await simulateWorker(async () => { throw new TypeError("offline"); })(request);
  assert.equal(offline.status, 503);
  assert.equal(offline.headers.get("Cache-Control"), "no-store");
  assert.match(await offline.text(), /أنت غير متصل بالإنترنت/);
});
test("private screens, APIs, writes and third-party traffic are never intercepted or replayed", () => {
  let calls = 0;
  const dispatch = simulateWorker(async () => { calls++; return new Response(""); });
  for (const [url, method, mode] of [
    ["/api/owner/transaction-history", "GET", "cors"], ["/api/owner/bookings", "POST", "cors"],
    ["/dashboard", "GET", "navigate"], ["/login", "GET", "navigate"],
    ["/", "POST", "navigate"], ["/", "GET", "cors"],
    ["https://another.invalid/", "GET", "navigate"],
  ]) assert.equal(dispatch({ url: new URL(url, "https://example.invalid").href, method, mode }), undefined);
  assert.equal(calls, 0);
});
