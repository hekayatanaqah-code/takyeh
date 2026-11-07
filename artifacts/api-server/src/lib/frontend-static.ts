import path from "node:path";
import { statSync } from "node:fs";
import express, { type Express } from "express";

/** Same-origin production hosting, without Replit's path-routing proxy. */
export function attachFrontend(app: Express, publicDirectory: string): void {
  const directory = path.resolve(publicDirectory);
  const index = path.join(directory, "index.html");
  if (!statSync(index).isFile()) throw new Error("Built frontend index.html is missing.");

  // API errors must remain API errors, never a successful SPA index response.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "المسار غير موجود" });
  });
  app.use((req, res, next) => {
    let pathname: string;
    try { pathname = decodeURIComponent(req.path); }
    catch { res.sendStatus(400); return; }
    if (pathname.split(/[\\/]/).some(segment => segment.startsWith("."))) {
      res.sendStatus(404);
      return;
    }
    next();
  });
  app.use(express.static(directory, {
    dotfiles: "deny",
    index: false,
    redirect: false,
    setHeaders(res, file) {
      const relative = path.relative(directory, file).split(path.sep).join("/");
      const hashedAsset = /^assets\/.+-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/i.test(relative);
      res.setHeader("Cache-Control", hashedAsset ? "public, max-age=31536000, immutable" : "no-cache");
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  }));
  app.get("/{*page}", (req, res, next) => {
    // Missing scripts, logos, manifests etc must not receive HTML.
    if (path.extname(req.path) || !req.accepts("html")) { next(); return; }
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(index);
  });
}
