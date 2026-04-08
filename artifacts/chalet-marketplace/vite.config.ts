import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const OG_HTML = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta property="og:type"        content="website" />
  <meta property="og:title"       content="تقييم تجربة الإقامة | شاليهات القصيم" />
  <meta property="og:description" content="شاركنا رأيك وساعدنا في تقديم أفضل تجربة لضيوفنا" />
  <meta property="og:locale"      content="ar_SA" />
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="تقييم تجربة الإقامة | شاليهات القصيم" />
  <meta name="twitter:description" content="شاركنا رأيك وساعدنا في تقديم أفضل تجربة لضيوفنا" />
  <title>تقييم تجربة الإقامة | شاليهات القصيم</title>
</head>
<body><p>تقييم تجربة الإقامة</p></body>
</html>`;

const BOT_AGENTS = ["facebookexternalhit", "facebot", "twitterbot", "whatsapp", "linkedinbot", "slackbot", "telegrambot", "discordbot"];

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    {
      name: "spa-fallback-and-og",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const url = req.url ?? "";
          if (!url.startsWith("/r/") && url !== "/r") return next();

          const ua = (req.headers["user-agent"] ?? "").toLowerCase();
          const isCrawler = BOT_AGENTS.some((b) => ua.includes(b));

          if (isCrawler) {
            res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
            res.end(OG_HTML);
            return;
          }

          req.url = "/index.html";
          next();
        });
      },
    },
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
