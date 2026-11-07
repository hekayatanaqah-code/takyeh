import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applicationContracts } from "./mariadb/application-contracts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const original = path.join(root, "lib/db/src/schema");
const native = path.join(root, "lib/db/src/mariadb/schema");
const target = path.join(root, "lib/db/src/mariadb/application-schema");
const load = async (directory: string) => new Map(await Promise.all(
  (await readdir(directory)).filter(name => name.endsWith(".ts")).map(async name =>
    [name, await readFile(path.join(directory, name), "utf8")] as const),
));
const generated = applicationContracts(await load(original), await load(native));
for (const [file, content] of generated) {
  await mkdir(path.dirname(path.join(target, file)), { recursive: true });
  await writeFile(path.join(target, file), content);
}
console.log(`Generated ${generated.size} native contract/model modules; current database connection unchanged.`);
