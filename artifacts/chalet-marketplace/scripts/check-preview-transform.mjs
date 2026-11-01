import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const modules = [
  "src/features/photography/PhotographerPortal.tsx",
  "src/features/photography/PhotographyAdmin.tsx",
  "src/features/photography/portalWidgets.tsx",
  "scripts/fixtures/preview-transform/generic.tsx",
  "scripts/fixtures/preview-transform/specialized.tsx",
];
const negativeModule = "scripts/fixtures/preview-transform/explicit-generic.tsx";
const parseError = /Unexpected token|SyntaxError|Parse failure|Expected corresponding JSX|Transform failed/i;

/** Inspect the HTTP result, then parse (never execute) the actual Vite output. */
export function assertTransformedModule({ status, contentType, body }, label, metadata = true) {
  assert.equal(status, 200, `${label}: HTTP ${status}\n${body.slice(0, 1600)}`);
  assert.match(contentType, /(?:java|ecma)script/i, `${label}: not JavaScript (${contentType}); wrong URL or SPA/login fallback`);
  // Vite's client legitimately defines the overlay implementation itself.
  if (metadata) {
    assert.doesNotMatch(body, /new\s+ErrorOverlay\b|vite-error-overlay|<title>Error<\/title>/i, `${label}: Vite error overlay returned as a module`);
  }
  const parsed = spawnSync(process.execPath, ["--input-type=module", "--check"], {
    input: body,
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(parsed.status, 0, `${label}: invalid transformed JavaScript\n${parsed.error?.message ?? parsed.stderr}`);
  if (metadata) {
    assert.match(body, /["']data-replit-metadata["']\s*:/, `${label}: preview metadata is missing; production/plain Vite is not sufficient`);
  }
}

export function assertRegressionDetected(result, label) {
  assert.equal(result.status, 500, `${label}: expected the isolated regression to return HTTP 500, got ${result.status}. If the preview plugin now supports generic JSX, review and update this negative control explicitly.`);
  assert.match(result.body, parseError, `${label}: HTTP 500 did not contain a transform/parser diagnostic\n${result.body.slice(0, 1600)}`);
  // Do not accept an unrelated server/dependency failure as reproduction.
  assert.match(result.body, /explicit-generic\.tsx/, `${label}: error did not identify the regression fixture`);
  assert.match(result.body, /data-replit-metadata/, `${label}: error did not show injected preview metadata`);
}

export async function requestModule(base, modulePath) {
  const url = new URL(modulePath, base);
  let response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/javascript", "Cache-Control": "no-cache" },
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    throw new Error(`${modulePath}: cannot reach the existing Vite workflow at ${url}. Start artifacts/chalet-marketplace: web; this check never starts a server. ${error.message}`, { cause: error });
  }
  // Keep the timeout active while consuming the body, too.
  const body = await response.text();
  return { status: response.status, contentType: response.headers.get("content-type") ?? "", body };
}

export function previewBaseUrl(env = process.env) {
  const value = env.PREVIEW_BASE_URL ?? (env.REPLIT_DEV_DOMAIN ? `https://${env.REPLIT_DEV_DOMAIN}/` : null);
  assert.ok(value, "Set PREVIEW_BASE_URL to the existing Vite preview URL (including its base path), or run inside Replit with REPLIT_DEV_DOMAIN.");
  const url = new URL(value);
  assert.ok(["http:", "https:"].includes(url.protocol), "Preview URL must use HTTP(S)");
  assert.ok(!url.search && !url.hash && !url.username && !url.password, "Preview URL must be a base URL without credentials, query, or hash");
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export async function checkPreviewTransform(base = previewBaseUrl()) {
  // A SPA fallback or production server must not accidentally satisfy this check.
  const client = await requestModule(base, "@vite/client");
  assertTransformedModule(client, "@vite/client", false);
  assert.match(client.body, /createHotContext/, "The target is not the running Vite development server");

  for (const modulePath of modules) {
    assertTransformedModule(await requestModule(base, modulePath), modulePath);
    console.log(`PASS transform + preview metadata: ${modulePath}`);
  }
  // Intentional 500 only for this isolated fixture, never for application modules.
  assertRegressionDetected(await requestModule(base, negativeModule), negativeModule);
  console.log("PASS negative control: valid generic JSX reproduces the preview parser failure (expected HTTP 500)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkPreviewTransform().catch((error) => {
    console.error(`FAIL preview transform: ${error.message}`);
    process.exitCode = 1;
  });
}
