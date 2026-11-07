import { build } from "esbuild";
import path from "node:path";
import { readFile } from "node:fs/promises";

/** Inspect the actual conditional runtime graph, not PostgreSQL's dev adapter. */
export async function nativeSourceGraph(root: string) {
  const result = await build({
    absWorkingDir: root,
    entryPoints: ["artifacts/api-server/src/hostinger.ts"],
    platform: "node", target: "node22", format: "esm", bundle: true,
    conditions: ["mariadb"], write: false, metafile: true, logLevel: "silent",
    plugins: [{
      name: "external-third-party-packages",
      setup(builder) {
        builder.onResolve({ filter: /^[^./]/ }, args => {
          if (args.path.startsWith("@workspace/") || args.path.startsWith("#")) return;
          return { path: args.path, external: true };
        });
      },
    }],
  });
  const files = Object.keys(result.metafile.inputs).map(file => path.resolve(root, file)).sort();
  const relative = new Set(files.map(file => path.relative(root, file)));
  const required = [
    "lib/db/src/mariadb/application.ts",
    "lib/db/src/mariadb/application-driver.ts",
    "lib/db/src/mariadb/application-schema/index.ts",
    "lib/db/src/mariadb/commands.ts",
    "lib/db/src/mariadb/runtime-models.ts",
  ];
  if (required.some(file => !relative.has(file)) ||
      relative.has("lib/db/src/index.ts") || relative.has("lib/db/src/mutations.ts")) {
    throw new Error("Native runtime bindings could not be verified.");
  }
  for (const input of Object.values(result.metafile.inputs)) {
    if (input.imports.some(item => item.external &&
      /^(pg(?:\/|$)|drizzle-orm\/(?:node-postgres|pg-core))/.test(item.path))) {
      throw new Error("PostgreSQL dependency remains in the native runtime graph.");
    }
  }
  // Read only code in the verified graph; never row data or environment files.
  return Promise.all(files.filter(file => /\.[cm]?[jt]sx?$/.test(file))
    .map(async file => ({ file: path.relative(root, file), text: await readFile(file, "utf8") })));
}
