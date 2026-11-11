import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("cloud build selects PostgreSQL without the MariaDB implementation", () => {
  const meta = JSON.parse(readFileSync(new URL("../artifacts/api-server/dist-cloud/build-meta.json", import.meta.url), "utf8"));
  const inputs = Object.keys(meta.inputs).map(name => "/" + name.replaceAll("\\", "/"));
  assert.ok(inputs.some(name => name.endsWith("/lib/db/src/index.ts")), "PostgreSQL connection must be bundled");
  assert.ok(inputs.some(name => name.endsWith("/lib/db/src/mutations.ts")), "PostgreSQL mutations must be bundled");
  assert.ok(inputs.some(name => name.endsWith("/lib/db/src/transaction-lock.ts")), "Transaction locking must be bundled");
  assert.equal(inputs.some(name => /\/lib\/db\/src\/mariadb\//.test(name)), false, "Cloud must not mix database engines");
  assert.ok(inputs.some(name => name.endsWith("/src/cloud.ts")), "Cloud entry must be bundled");
  assert.ok(inputs.some(name => name.endsWith("/local-storage/service.ts")), "Cloud uploads must use persistent storage");
  assert.ok(inputs.some(name => name.endsWith("/local-storage/ingress.ts")), "Signed local uploads must be mounted");
  assert.equal(inputs.some(name => name.endsWith("/lib/objectStorage.ts")), false, "Cloud must not require the Replit storage sidecar");
});
