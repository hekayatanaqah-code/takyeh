import { test } from "node:test";
import assert from "node:assert/strict";
import { recoveryAssetUrl } from "./route-import-retry";

test("recovery modules remain within the artifact base", () => {
  const url = recoveryAssetUrl("assets/Chalets.js", new URL("https://example.test/market/"));
  assert.equal(url.pathname, "/market/assets/Chalets.js");
  assert.equal(url.origin, "https://example.test");
});

test("recovery allows generated JS and stylesheet names", () => {
  for (const file of ["assets/recover-Admin-abc_123.js", "assets/TileLayer-Ab12.css"])
    assert.ok(recoveryAssetUrl(file, new URL("https://example.test/")));
});

test("never import arbitrary origins, traversal, or non-build assets", () => {
  for (const value of [
    "https://other.test/assets/Admin.js", "/api/auth/user", "../assets/Admin.js",
    "assets/../Admin.js", "assets/anything.svg", "//example.test/assets/evil.js",
  ]) assert.throws(() => recoveryAssetUrl(value, new URL("https://example.test/market/")));
});
