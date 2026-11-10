import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { recoveryRouteKey } from "./route-recovery-plugin";

for (const root of [
  "/home/runner/workspace/artifacts/chalet-marketplace",
  "/opt/render/project/src/artifacts/chalet-marketplace",
  "/tmp/src/checkout/src/artifacts/chalet-marketplace",
]) {
  test(`route keys remain relative to the application source under ${root}`, () => {
    for (const route of ["pages/Dashboard", "pages/Admin", "features/photography/PhotographerPortal"]) {
      assert.equal(recoveryRouteKey(root, path.join(root, "src", `${route}.tsx`)), route);
    }
    assert.equal(recoveryRouteKey(root, path.join(root, "src/lib/helpers.ts")), "lib/helpers");
  });
}
