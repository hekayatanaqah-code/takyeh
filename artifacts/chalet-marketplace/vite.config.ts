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
  <meta name="description" content="منصة تكية لحجز الوجهات والخدمات، نضع بين أيديكم خيارات متنوعة وتجربة حجز فريدة وموثوقة." />
  <link rel="canonical" href="https://takyah.replit.app/" />
  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="منصة تكية" />
  <meta property="og:title"       content="منصة تكية - لحجز الوجهات والخدمات" />
  <meta property="og:description" content="منصة تكية لحجز الوجهات والخدمات، نضع بين أيديكم خيارات متنوعة وتجربة حجز فريدة وموثوقة." />
  <meta property="og:url"         content="https://takyah.replit.app/" />
  <meta property="og:locale"      content="ar_SA" />
  <meta name="twitter:card"        content="summary" />
  <meta name="twitter:title"       content="منصة تكية - لحجز الوجهات والخدمات" />
  <meta name="twitter:description" content="منصة تكية لحجز الوجهات والخدمات، نضع بين أيديكم خيارات متنوعة وتجربة حجز فريدة وموثوقة." />
  <title>منصة تكية - لحجز الوجهات والخدمات</title>
</head>
<body><p>منصة تكية - لحجز الوجهات والخدمات</p></body>
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
