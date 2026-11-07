import { insertRecords } from "@workspace/db/mutations";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { db, photographyReceiptsTable, photographyReceiptUploadsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { lockPhotographyReceipts } from "./photography-receipt-lock";

export const receiptStorage = new ObjectStorageService();
const maxSize = 10 * 1024 * 1024;
export const receiptUploadSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().min(1).max(maxSize),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png", "image/webp"]),
}).strict();
export const receiptCompleteSchema = z.object({
  objectPath: z.string().regex(/^\/objects\/(?:uploads\/[0-9a-f-]{36}|photography-receipts\/source\/[0-9a-f-]{36})$/),
  uploadProof: z.string().max(2000),
}).strict();
function mac(value: string) {
  if (!process.env.SESSION_SECRET) throw new Error("receipt_signing_unavailable");
  return createHmac("sha256", process.env.SESSION_SECRET).update(value).digest("hex");
}
export async function requestPhotographyReceipt(adminId: string, input: z.infer<typeof receiptUploadSchema>) {
  const id = randomUUID();
  const objectPath = `/objects/photography-receipts/source/${id}`;
  // Register both possible objects BEFORE signing or writing. Failed signing,
  // invalid bytes and a process crash after conversion remain discoverable.
  const expiry = Date.now() + 16 * 60000;
  await db.insert(photographyReceiptUploadsTable).values({
    id, sourcePath: objectPath, preparedPath: `/objects/photography-receipts/prepared/${id}`,
    uploadedBy: adminId, expiresAt: new Date(expiry),
  });
  const uploadURL = await receiptStorage.getObjectEntityUploadURL(`photography-receipts/source/${id}`);
  const encoded = Buffer.from(JSON.stringify({ adminId, objectPath, ...input, expiry })).toString("base64url");
  return { uploadURL, objectPath, uploadProof: `${encoded}.${mac(encoded)}` };
}
export async function completePhotographyReceipt(adminId: string, input: z.infer<typeof receiptCompleteSchema>) {
  const [encoded, signature, extra] = input.uploadProof.split(".");
  if (extra || !/^[0-9a-f]{64}$/.test(signature ?? "") || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mac(encoded), "hex"))) throw new Error("receipt_proof");
  const data = JSON.parse(Buffer.from(encoded, "base64url").toString()) as { adminId: string; objectPath: string; name: string; contentType: string; expiry: number };
  if (data.adminId !== adminId || data.objectPath !== input.objectPath || data.expiry <= Date.now()) throw new Error("receipt_proof");
  return db.transaction(async tx => {
  await lockPhotographyReceipts(tx);
  const [upload] = await tx.select().from(photographyReceiptUploadsTable).where(eq(photographyReceiptUploadsTable.sourcePath, input.objectPath));
  if (upload && (upload.uploadedBy !== adminId || ["deleting", "deleted"].includes(upload.state))) throw new Error("receipt_proof");
  const [existing] = await tx.select().from(photographyReceiptsTable).where(eq(photographyReceiptsTable.sourcePath, input.objectPath));
  if (existing) return { receiptId: existing.id, name: existing.name, contentType: existing.contentType, size: existing.size };
  if (!upload) throw new Error("receipt_proof"); // Legacy saved receipts still work; untracked legacy uploads never enter cleanup.
  const file = await receiptStorage.getObjectEntityFile(input.objectPath);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of file.createReadStream({ start: 0, end: maxSize })) {
    const bytes = Buffer.from(chunk); size += bytes.length;
    if (size > maxSize) throw new Error("receipt_size");
    chunks.push(bytes);
  }
  let buffer = Buffer.concat(chunks);
  let contentType = data.contentType, extension = "pdf";
  if (contentType === "application/pdf") {
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-")) || !buffer.subarray(Math.max(0, buffer.length - 1024)).includes(Buffer.from("%%EOF"))) throw new Error("receipt_format");
  } else {
    try {
      const metadata = await sharp(buffer, { limitInputPixels: 24000000 }).metadata();
      if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("receipt_format");
      buffer = await sharp(buffer, { limitInputPixels: 24000000 }).rotate().webp({ quality: 90 }).toBuffer();
    } catch { throw new Error("receipt_format"); }
    contentType = "image/webp"; extension = "webp";
  }
  const objectPath = (await receiptStorage.uploadBuffer(buffer, contentType, extension, upload.preparedPath.replace(/^\/objects\//, ""))).replace(/^\/api\/storage/, "");
  await receiptStorage.trySetObjectEntityAclPolicy(objectPath, { visibility: "private", owner: `photography-receipt:${adminId}` });
  const name = `${data.name.replace(/[\\/\r\n\x00-\x1f]/g, "_").replace(/\.[^.]*$/, "")}.${extension}`;
  const [receipt] = await insertRecords(tx, photographyReceiptsTable, {
    objectPath, sourcePath: input.objectPath, name, contentType, size: buffer.length, uploadedBy: adminId,
  });
  await tx.update(photographyReceiptUploadsTable).set({ state: "ready", receiptId: receipt.id, error: null }).where(eq(photographyReceiptUploadsTable.id, upload.id));
  // No eager deletion. Even the source copy is retained until reviewed cleanup.
  return { receiptId: receipt.id, name: receipt.name, contentType, size: receipt.size };
  }).catch(async error => {
    if (["receipt_format", "receipt_size"].includes((error as Error).message)) {
      await db.transaction(async tx => {
        await lockPhotographyReceipts(tx);
        const [upload] = await tx.select().from(photographyReceiptUploadsTable).where(eq(photographyReceiptUploadsTable.sourcePath, input.objectPath));
        if (upload && !["ready", "deleting", "deleted"].includes(upload.state)) {
          await tx.update(photographyReceiptUploadsTable).set({ state: "invalid", error: (error as Error).message }).where(eq(photographyReceiptUploadsTable.id, upload.id));
        }
      });
    }
    throw error;
  });
}
