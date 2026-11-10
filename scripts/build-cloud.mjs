import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = args => execFileSync("pnpm", args, {
  cwd: root, stdio: "inherit",
  env: { ...process.env, NODE_ENV: "production", PORT: process.env.PORT || "3000", BASE_PATH: "/" },
});
run(["--filter", "@workspace/api-server", "exec", "node", "build.mjs", "--cloud"]);
run(["--filter", "@workspace/chalet-marketplace", "run", "build"]);
