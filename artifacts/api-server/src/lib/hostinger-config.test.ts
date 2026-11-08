import { test } from "node:test";
import assert from "node:assert/strict";
import { hostingerConfig } from "./hostinger-config";
import path from "node:path";
import { serverPort } from "./server-port";

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
test("uses only the dynamic hosting port and resolves public relative to the application", () => {
  for(const raw of [undefined,"","0","-1","80.5","65536","abc","3000/socket"," 8080"]){
    assert.throws(()=>serverPort(raw),/PORT/);
  }
  for(const raw of ["1","3000","49155","65535"])assert.equal(serverPort(raw),Number(raw));
  const root=path.resolve("/tmp/hostinger app");
  assert.equal(hostingerConfig({...env,PORT:"49155",FRONTEND_DIST_DIR:undefined},"mariadb",root).frontendDirectory,path.join(root,"public"));
  assert.equal(hostingerConfig({...env,FRONTEND_DIST_DIR:"./public"},"mariadb",root).frontendDirectory,path.join(root,"public"));
  assert.equal(hostingerConfig({...env,FRONTEND_DIST_DIR:"/tmp/custom-public"},"mariadb",root).frontendDirectory,"/tmp/custom-public");
});
