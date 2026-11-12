"use strict";

const path = require("path");
const http = require("http");
const createRequire = require("module").createRequire;
const pathToFileURL = require("url").pathToFileURL;

const root = __dirname;
if (process.env.NODE_ENV !== "production") {
    try {
        require("dotenv").config();
    } catch (e) {}
}

const apiRequire = createRequire(path.join(root, "artifacts/api-server/package.json"));
const express = apiRequire("express");
const app = express();

// استدعاء ملف واتساب تقنيات ومسار الـ OTP
const { sendTaqnyatOTP } = require('./taqnyatWhatsApp');

app.use(express.json());

// مسار طلب رمز التحقق للملاك عبر واتساب تقنيات
app.post('/api/owner/send-otp', async (req, res) => {
    const { phone } = req.body;
    
    if (!phone) {
        return res.status(400).json({ success: false, error: "رقم الهاتف مطلوب" });
    }

    const otpCode = Math.floor(1000 + Math.random() * 9000).toString();
    const result = await sendTaqnyatOTP(phone, otpCode);

    if (result.success) {
        res.json({ success: true, message: "تم إرسال رمز التحقق بنجاح عبر الواتساب", otp: otpCode });
    } else {
        res.status(500).json({ success: false, error: "فشل إرسال رسالة الواتساب", details: result.error });
    }
});

app.disable("x-powered-by");
app.set("trust proxy", 1);

const publicDirectory = path.resolve(root, process.env.FRONTEND_DIST_DIR || "dist");
const backendFile = path.join(root, "artifacts/api-server/dist-cloud/cloud.mjs");

let runtime;
let backend;
let state = "starting";
let stopping = false;

app.get("/healthz", (_req, res) => {
    res.set("cache-control", "no-store").json({ status: stopping ? "stopping" : state });
});

app.get("/readyz", (_req, res) => {
    const ready = state === "ready" && !stopping;
    res.status(ready ? 200 : 503).set("cache-control", "no-store").json({ applicationReady: ready, status: state });
});

app.use((req, res, next) => {
    if (req.path !== "/api" && !req.path.startsWith("/api/")) return next();
    if (runtime && !stopping) return runtime.handler(req, res);
    res.status(503).set("cache-control", "no-store").json({
        error: "state === 'failed' ? 'جاري تجهيز خدمة المنصة' : 'الخدمة تعمل غير متاحة حالياً'",
        code: state === "failed" ? "BACKEND_UNAVAILABLE" : "BACKEND_STARTING"
    });
});

app.use((req, res, next) => {
    let pathname;
    try {
        pathname = decodeURIComponent(req.path);
    } catch (_) {
        return res.sendStatus(400);
    }
    if (pathname.includes("\\") || pathname.split("/").some(part => part.startsWith("."))) {
        return res.sendStatus(400);
    }
    next();
});

app.use(express.static(publicDirectory, {
    dotfiles: "deny",
    index: false,
    redirect: false,
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-cache");
    }
}));

app.get(/^(?!\/api)/, (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(publicDirectory, "index.html"));
});

app.use((_req, res) => {
    res.sendStatus(404);
});

const server = http.createServer(app);

server.listen(process.env.PORT || 10000, "0.0.0.0", () => {
    console.log(`HTTP Server listening on 0.0.0.0:${process.env.PORT || 10000}`);
});

import(pathToFileURL(backendFile).href).then(async module => {
    backend = module;
    if (stopping) return module.closeCloudResources();
    runtime = await module.startCloud(server);
    if (stopping) return runtime.shutdown("startupCancelled");
    state = "ready";
    console.log("Application backend ready");
}).catch(async error => {
    state = "failed";
    console.error("Backend startup failed. Check build output, database and storage configuration.", error);
    if (backend) await backend.closeCloudResources().catch(() => undefined);
});

async function shutdown(signal) {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 25000);
    deadline.unref();
    try {
        if (runtime) await runtime.shutdown(signal);
        else {
            await new Promise(resolve => server.close(resolve));
            server.closeAllConnections();
            if (backend) await backend.closeCloudResources();
        }
        clearTimeout(deadline);
    } catch (_) {
        process.exitCode = 1;
    }
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
