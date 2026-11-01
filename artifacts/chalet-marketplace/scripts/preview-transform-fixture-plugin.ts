import type { Plugin } from "vite";
import { stripVTControlCharacters } from "node:util";

const fixturePath = "/scripts/fixtures/preview-transform/explicit-generic.tsx";

/**
 * Use the real dev transform chain, but contain the deliberate negative control.
 * Vite's normal error middleware broadcasts parser errors to every HMR client
 * (and buffers them for the next visitor), even for unimported fixture modules.
 */
export function previewTransformFixture(): Plugin {
  return {
    name: "isolated-preview-transform-fixture",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const pathname = req.url?.split("?")[0];
        const fixtureUrl = `${server.config.base.replace(/\/$/, "")}${fixturePath}`;
        if (req.method !== "GET" || pathname !== fixtureUrl) return next();
        try {
          const result = await server.transformRequest(fixturePath);
          if (!result) {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Preview regression fixture not found");
            return;
          }
          res.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" });
          res.end(result.code);
        } catch (error) {
          const diagnostic = error as { message?: string; id?: string; frame?: string; plugin?: string };
          // Keep the diagnostic in the HTTP response only, not the HMR channel.
          res.writeHead(500, { "Content-Type": "application/json", "Cache-Control": "no-store" });
          res.end(JSON.stringify({
            message: stripVTControlCharacters(diagnostic.message ?? String(error)),
            id: diagnostic.id,
            frame: diagnostic.frame,
            plugin: diagnostic.plugin,
          }));
        }
      });
    },
  };
}
