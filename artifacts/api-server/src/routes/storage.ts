import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, readFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import multer from "multer";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 15 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_VIDEO_SIZE_BYTES },
});

function ffmpegToBuffer(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264",
        "-crf 28",
        "-preset fast",
        "-vf scale=-2:720",
        "-c:a aac",
        "-b:a 128k",
        "-movflags +faststart",
        "-t 30",
      ])
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 */
router.post("/storage/uploads/request-url", async (req: Request, res: Response) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Missing or invalid required fields" });
    return;
  }

  try {
    const { name, size, contentType } = parsed.data;

    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

    res.json(
      RequestUploadUrlResponse.parse({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType },
      }),
    );
  } catch (error) {
    req.log.error({ err: error }, "Error generating upload URL");
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

/**
 * POST /storage/uploads/process
 *
 * Server-side media processing upload.
 * Accepts a single multipart file:
 *   - Images → compressed to WebP (max 2MB input, quality 82, max 2048px width)
 *   - Videos → re-encoded to H.264 MP4 (max 15MB input, max 720p, 30s)
 * Returns { url } with the path for the stored object.
 */
router.post(
  "/storage/uploads/process",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "No file provided" });
      return;
    }

    const isImage = file.mimetype.startsWith("image/");
    const isVideo = file.mimetype.startsWith("video/");

    if (!isImage && !isVideo) {
      res.status(400).json({ error: "Only image or video files are accepted" });
      return;
    }

    try {
      let outputBuffer: Buffer;
      let contentType: string;
      let ext: string;

      if (isImage) {
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
          res.status(400).json({ error: "الصورة تتجاوز الحد الأقصى 2MB" });
          return;
        }
        outputBuffer = await sharp(file.buffer)
          .resize({ width: 2048, withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer();
        contentType = "image/webp";
        ext = "webp";
      } else {
        if (file.size > MAX_VIDEO_SIZE_BYTES) {
          res.status(400).json({ error: "الفيديو يتجاوز الحد الأقصى 15MB" });
          return;
        }
        const id = randomUUID();
        const inputPath = join(tmpdir(), `${id}_in`);
        const outputPath = join(tmpdir(), `${id}_out.mp4`);
        await writeFile(inputPath, file.buffer);
        try {
          await ffmpegToBuffer(inputPath, outputPath);
          outputBuffer = await readFile(outputPath);
        } finally {
          await unlink(inputPath).catch(() => {});
          await unlink(outputPath).catch(() => {});
        }
        contentType = "video/mp4";
        ext = "mp4";
      }

      const url = await objectStorageService.uploadBuffer(outputBuffer, contentType, ext);
      res.json({ url });
    } catch (err) {
      req.log.error({ err }, "Error processing upload");
      res.status(500).json({ error: "فشل معالجة الملف" });
    }
  }
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get("/storage/objects/*path", async (req: Request, res: Response) => {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join("/") : raw;
    const objectPath = `/objects/${wildcardPath}`;
    const objectFile = await objectStorageService.getObjectEntityFile(objectPath);

    if (!req.isAuthenticated()) {
      res.status(401).json({ error: "يجب تسجيل الدخول أولاً" });
      return;
    }

    const response = await objectStorageService.downloadObject(objectFile);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      req.log.warn({ err: error }, "Object not found");
      res.status(404).json({ error: "Object not found" });
      return;
    }
    req.log.error({ err: error }, "Error serving object");
    res.status(500).json({ error: "Failed to serve object" });
  }
});

export default router;
