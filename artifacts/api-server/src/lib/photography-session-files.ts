import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { z } from "zod";
import { receiptStorage } from "./photography-receipts";

const types = ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/zip", "video/mp4", "video/quicktime"] as const;
export const sessionUploadSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().min(1).max(100 * 1024 * 1024),
  contentType: z.enum(types),
}).strict();
const fileProofSchema = z.object({
  objectPath: z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/),
  uploadProof: z.string().min(1).max(3000),
}).strict();
export const sessionDeliverySchema = z.object({
  deliveryUrl: z.string().trim().max(2000).url().refine(v => {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !/^(localhost|127\.|0\.|10\.|192\.168\.|\[)/i.test(u.hostname);
  }, "استخدم رابط تنزيل HTTPS عاماً").optional(),
  files: z.array(fileProofSchema).max(20).default([]),
}).strict().refine(v => !!v.deliveryUrl || v.files.length > 0, "أرفق ملفاً أو رابط تنزيل قبل التسليم");
function mac(value: string) {
  if (!process.env.SESSION_SECRET) throw new Error("session_signing_unavailable");
  return createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("hex");
}
export async function requestSessionFile(bookingId: number, photographerId: number, input: z.infer<typeof sessionUploadSchema>) {
  const uploadURL = await receiptStorage.getObjectEntityUploadURL();
  const objectPath = receiptStorage.normalizeObjectEntityPath(uploadURL);
  const encoded = Buffer.from(JSON.stringify({ bookingId, photographerId, objectPath, ...input, expiry: Date.now() + 3600000 })).toString("base64url");
  return { uploadURL, objectPath, uploadProof: `${encoded}.${mac(encoded)}` };
}
export async function verifySessionFiles(bookingId: number, photographerId: number, files: z.infer<typeof fileProofSchema>[]) {
  const result: { objectPath: string; name: string; contentType: string; size: number }[] = [];
  for (const input of files) {
    const [encoded, signature, extra] = input.uploadProof.split(".");
    if (extra || !/^[0-9a-f]{64}$/.test(signature ?? "") || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mac(encoded), "hex"))) throw new Error("delivery_files");
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString()) as { bookingId: number; photographerId: number; objectPath: string; expiry: number; name: string; size: number; contentType: string };
    if (data.bookingId !== bookingId || data.photographerId !== photographerId || data.objectPath !== input.objectPath || data.expiry < Date.now()) throw new Error("delivery_files");
    const file = await receiptStorage.getObjectEntityFile(input.objectPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) !== data.size || metadata.contentType !== data.contentType) throw new Error("delivery_files");
    const source = file.bucket.file(file.name, { generation: metadata.generation });
    const chunks: Buffer[] = [];
    for await (const chunk of source.createReadStream({ start: 0, end: 31 })) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    const valid = data.contentType === "image/jpeg" ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255]))
      : data.contentType === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : data.contentType === "image/webp" ? bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP"
      : data.contentType === "application/pdf" ? bytes.subarray(0,5).toString() === "%PDF-"
      : data.contentType === "application/zip" ? bytes.subarray(0,2).toString() === "PK"
      : bytes.subarray(4,8).toString() === "ftyp";
    if (!valid) throw new Error("delivery_files");
    const id = randomUUID();
    const name = file.name.replace(/\/uploads\/[^/]+$/, `/deliveries/${id}`);
    if (name === file.name) throw new Error("delivery_files");
    await source.copy(file.bucket.file(name));
    const objectPath = `/objects/deliveries/${id}`;
    await receiptStorage.trySetObjectEntityAclPolicy(objectPath, { visibility: "private", owner: `photography-session:${bookingId}:${photographerId}` });
    result.push({ objectPath, name: data.name.replace(/[\\/\r\n\x00-\x1f]/g, "_"), contentType: data.contentType, size: data.size });
  }
  return result;
}
