import assert from "node:assert/strict";
import test from "node:test";
import { assertRegressionDetected, assertTransformedModule, previewBaseUrl, requestModule } from "./check-preview-transform.mjs";

const valid = {
  status: 200,
  contentType: "text/javascript",
  body: 'export const props = { "data-replit-metadata": "fixture" };',
};

test("accepts parsed preview JavaScript without executing it", () => {
  assertTransformedModule({ ...valid, body: `${valid.body}\nthrow new Error("must not execute");` }, "fixture");
  assertTransformedModule({ ...valid, body: 'export const overlayTag = "vite-error-overlay";' }, "@vite/client", false);
});

test("rejects HTTP 500 and reports the module and parser diagnostic", () => {
  assert.throws(() => assertTransformedModule({ ...valid, status: 500, body: "Unexpected token" }, "PhotographyAdmin.tsx"), /PhotographyAdmin\.tsx: HTTP 500\nUnexpected token/);
});

test("rejects successful HTML fallback and redirects", async () => {
  assert.throws(() => assertTransformedModule({ ...valid, contentType: "text/html", body: "<html>Login</html>" }, "fixture"), /not JavaScript/);
  assert.throws(() => assertTransformedModule({ ...valid, status: 302 }, "fixture"), /HTTP 302/);
});

test("rejects HTTP 200 parser errors, error overlays, and missing preview plugin", () => {
  assert.throws(() => assertTransformedModule({ ...valid, body: "export const x = <Broken />;" }, "fixture"), /invalid transformed JavaScript/);
  assert.throws(() => assertTransformedModule({ ...valid, body: "new ErrorOverlay({});" }, "fixture"), /error overlay/);
  assert.throws(() => assertTransformedModule({ ...valid, body: "export const x = 1;" }, "fixture"), /metadata is missing/);
});

test("negative control requires the exact preview parser failure, not arbitrary 500", () => {
  const regression = { status: 500, body: "explicit-generic.tsx: Unexpected token near data-replit-metadata" };
  assertRegressionDetected(regression, "negative");
  assert.throws(() => assertRegressionDetected({ ...regression, status: 200 }, "negative"), /expected.*HTTP 500/);
  assert.throws(() => assertRegressionDetected({ status: 500, body: "Cannot find module" }, "negative"), /parser diagnostic/);
  assert.throws(() => assertRegressionDetected({ status: 500, body: "Unexpected token elsewhere" }, "negative"), /did not identify/);
  assert.throws(() => assertRegressionDetected({ status: 500, body: "explicit-generic.tsx: Unexpected token" }, "negative"), /injected preview metadata/);
});

test("base URL preserves the artifact path; no silent localhost fallback", () => {
  assert.equal(previewBaseUrl({ PREVIEW_BASE_URL: "http://localhost:1234/market" }).href, "http://localhost:1234/market/");
  assert.equal(previewBaseUrl({ REPLIT_DEV_DOMAIN: "preview.example" }).href, "https://preview.example/");
  assert.throws(() => previewBaseUrl({}), /Set PREVIEW_BASE_URL/);
  assert.throws(() => previewBaseUrl({ PREVIEW_BASE_URL: "file:///tmp" }), /HTTP/);
});

test("connection errors explain how to start the existing workflow", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new Error("connection refused"); });
  await assert.rejects(requestModule("http://localhost:1234/market/", "src/file.tsx"), /src\/file\.tsx: cannot reach the existing Vite workflow.*never starts a server/);
});

test("requests use artifact-relative paths, bounded timeouts, no cache, and no redirects", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.href, "https://preview.example/market/src/file.tsx");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers["Cache-Control"], "no-cache");
    assert.ok(options.signal instanceof AbortSignal);
    return new Response(valid.body, { headers: { "content-type": valid.contentType } });
  });
  assert.deepEqual(await requestModule("https://preview.example/market/", "src/file.tsx"), valid);
});
