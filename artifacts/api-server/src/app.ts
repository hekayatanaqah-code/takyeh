import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";
import { attachFrontend } from "./lib/frontend-static";
import { localStorageIngress } from "#storage-ingress";

const app: Express = express();
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0].replace(/(\/photography\/invites\/)[^/]+/, "$1[redacted]"),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
// Signed byte uploads must precede JSON/urlencoded parsers. The bearer ticket
// authorizes a single immutable destination, not a general filesystem path.
if(localStorageIngress) app.use("/api/storage",localStorageIngress);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

if (process.env.NODE_ENV !== "production") {
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  });
}

app.use("/api", router);

// Explicitly opt in when deploying frontend + API in one Node.js service.
// Replit's managed preview keeps its existing two-service routing unchanged.
if (process.env.FRONTEND_DIST_DIR) {
  attachFrontend(app, process.env.FRONTEND_DIST_DIR);
}

export default app;
