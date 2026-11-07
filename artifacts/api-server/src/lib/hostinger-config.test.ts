import { test } from "node:test";
import assert from "node:assert/strict";
import { hostingerConfig } from "./hostinger-config";

const env: NodeJS.ProcessEnv = {
  NODE_ENV: "production", PORT: "8080",
  MARIADB_DATABASE_URL: "mysql://localhost/offline_config_test",
  SESSION_SECRET: "offline-config-validation-only-not-a-live-secret",
  DISABLE_STARTUP_SEEDING: "true", FRONTEND_DIST_DIR: "./public",
  APP_STORAGE_DIR:"/tmp/offline-private-storage",PUBLIC_SITE_URL:"https://example.test",
};
test("blocks legacy runtime before any environment/database work", () => {
  assert.throws(() => hostingerConfig({}, "postgresql"), /not been fully ported/);
});
test("requires valid production configuration, without PostgreSQL fallback", () => {
  assert.equal(hostingerConfig(env, "mariadb").port, 8080);
  assert.throws(() => hostingerConfig({ ...env, DATABASE_URL: "postgres://localhost/test" }, "mariadb"), /legacy/);
  assert.throws(() => hostingerConfig({ ...env, MARIADB_DATABASE_URL: "postgres://localhost/test" }, "mariadb"), /mysql/);
  assert.throws(() => hostingerConfig({ ...env, PORT: "8080.5" }, "mariadb"), /PORT/);
  assert.throws(() => hostingerConfig({ ...env, PORT: "65536" }, "mariadb"), /PORT/);
  assert.throws(() => hostingerConfig({ ...env, SESSION_SECRET: "" }, "mariadb"), /SESSION_SECRET/);
  assert.throws(() => hostingerConfig({ ...env, DISABLE_STARTUP_SEEDING: "false" }, "mariadb"), /seed/);
});
