import { build } from "esbuild";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

/** The hosting checkout may itself be named "src" (as it is on Render). */
export function recoveryRouteKey(root: string, moduleId: string): string {
  return path.relative(path.join(root, "src"), moduleId).split(path.sep).join("/").replace(/\.tsx?$/, "");
}

/**
 * A fallback route has its static dependency graph in ONE module. Native ESM
 * caches failed dependency URLs, so changing only the route URL cannot recover
 * that graph. Keep the eagerly loaded graph external to preserve React, auth,
 * query-client and other application singletons.
 *
 * These files are downloaded only after an explicit retry, never at boot.
 */
export function routeRecoveryPlugin(): Plugin {
  let root: string;
  const routeIds = new Set<string>();
  return {
    name: "route-recovery-bundles",
    apply: "build",
    configResolved(config) { root = config.root; },
    buildStart() {
      const app = readFileSync(path.join(root, "src/App.tsx"), "utf8");
      const imports = [...app.matchAll(/import\(["'](\.\/(?:pages|features)\/[^"']+)["']\)/g)];
      for (const specifier of new Set(imports.map(match => match[1]))) {
        routeIds.add(path.resolve(root, "src", `${specifier}.tsx`));
      }
      // Dashboard's shared subgraph otherwise makes Rollup expose its module
      // namespace under a generated export, rather than a default page export.
      // Do not mark all routes as entries: that fragments the initial graph.
      this.emitFile({
        type: "chunk", id: path.join(root, "src/pages/Dashboard.tsx"),
        preserveSignature: "strict",
      });
    },
    async generateBundle(_options, bundle) {
      const chunks = Object.values(bundle).filter(item => item.type === "chunk");
      const byName = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
      const eager = new Set<string>();
      const visit = (file: string) => {
        if (eager.has(file)) return;
        eager.add(file);
        byName.get(file)?.imports.forEach(visit);
      };
      const entry = chunks.find(chunk => chunk.isEntry && chunk.moduleIds.some(id => id.endsWith("/src/main.tsx")));
      if (!entry) throw new Error("Route recovery requires the application entry");
      // emitFile also marks route facades as entries. They are NOT eagerly
      // loaded; only the HTML application's static dependency closure is.
      visit(entry.fileName);

      const routes: Record<string, { file: string; css: string[] }> = {};
      for (const chunk of chunks) {
        const key = chunk.facadeModuleId ? recoveryRouteKey(root, chunk.facadeModuleId) : undefined;
        if (!key || !(key.startsWith("pages/") || key === "features/photography/PhotographerPortal")) continue;
        const file = `assets/recover-${path.basename(chunk.fileName)}`;
        const css = new Set<string>();
        const seen = new Set<string>();
        const collectCss = (name: string) => {
          if (seen.has(name)) return;
          seen.add(name);
          const item = byName.get(name);
          item?.viteMetadata?.importedCss.forEach(style => css.add(style));
          item?.imports.forEach(collectCss);
        };
        collectCss(chunk.fileName);
        const result = await build({
          stdin: { contents: chunk.code, resolveDir: "/route-build/assets", sourcefile: path.basename(chunk.fileName) },
          bundle: true,
          write: false,
          format: "esm",
          target: "es2022",
          minify: true,
          logLevel: "silent",
          plugins: [{
            name: "built-route-graph",
            setup(builder) {
              builder.onResolve({ filter: /.*/ }, args => {
                const name = path.posix.normalize(path.posix.join("assets", args.path));
                if (!byName.has(name)) throw new Error(`Unknown route dependency: ${args.path}`);
                if (eager.has(name) || args.kind === "dynamic-import") {
                  return { path: `./${path.posix.basename(name)}`, external: true };
                }
                return { path: name, namespace: "route-build" };
              });
              builder.onLoad({ filter: /.*/, namespace: "route-build" }, args => ({
                contents: byName.get(args.path)!.code,
                loader: "js",
                resolveDir: "/route-build/assets",
              }));
            },
          }],
        });
        this.emitFile({ type: "asset", fileName: file, source: result.outputFiles[0].text });
        routes[key] = { file, css: [...css] };
      }
      for (const id of routeIds) {
        const key = recoveryRouteKey(root, id);
        if (!routes[key]) throw new Error(`Route lacks a recovery facade: ${key}`);
      }
      this.emitFile({
        type: "asset", fileName: "route-recovery.json",
        source: JSON.stringify({ entry: entry.fileName, startup: [...eager], routes }),
      });
    },
  };
}
