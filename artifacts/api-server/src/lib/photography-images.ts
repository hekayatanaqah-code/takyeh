import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { ObjectStorageService } from "./objectStorage";
import { getObjectAclPolicy } from "./objectAcl";

const storage = new ObjectStorageService();
export const MAX_PROFILE_IMAGE_SIZE = 5 * 1024 * 1024;
const imageTypes = ["image/jpeg", "image/png", "image/webp"] as const;
const objectPathSchema = z.string().regex(/^\/objects\/uploads\/[0-9a-f-]{36}$/);
export const profileImageUploadSchema = z.object({
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_PROFILE_IMAGE_SIZE),
  contentType: z.enum(imageTypes),
  inviteToken: z.string().min(1).max(256).optional(),
});
export const profileImageCompleteSchema = z.object({
  objectPath: objectPathSchema,
  uploadProof: z.string().regex(/^\d{13}\.[0-9a-f]{64}$/),
  inviteToken: z.string().min(1).max(256).optional(),
});
function signature(id: number, path: string, expiry: number) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Profile image signing is not configured");
  return createHmac("sha256", secret).update(`photographer-image:${id}:${path}:${expiry}`).digest("hex");
}
export function validImageProof(id: number, path: string, proof: string): boolean {
  if (!/^\d{13}\.[0-9a-f]{64}$/.test(proof) || !objectPathSchema.safeParse(path).success) return false;
  const [expiryText, supplied] = proof.split(".");
  const expiry = Number(expiryText);
  if (expiry <= Date.now() || expiry > Date.now() + 20 * 60000) return false;
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(signature(id, path, expiry), "hex"));
}
export async function requestProfileImage(id: number) {
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  const expiry = Date.now() + 15 * 60000;
  return { uploadURL, objectPath, uploadProof: `${expiry}.${signature(id, objectPath, expiry)}` };
}
export async function completeProfileImage(id: number, objectPath: string, uploadProof: string) {
  if (!validImageProof(id, objectPath, uploadProof)) throw new Error("انتهت صلاحية رفع الصورة أو لا تخص هذا الحساب");
  const file = await storage.getObjectEntityFile(objectPath);
  const [metadata] = await file.getMetadata();
  if (!imageTypes.includes(metadata.contentType as typeof imageTypes[number])
    || !Number(metadata.size) || Number(metadata.size) > MAX_PROFILE_IMAGE_SIZE) {
    throw new Error("اختر صورة JPG أو PNG أو WebP لا تتجاوز ٥ ميجابايت");
  }
  // Bound the download too: a still-valid signed PUT can replace the object after the metadata check.
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of file.createReadStream({ start: 0, end: MAX_PROFILE_IMAGE_SIZE })) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_PROFILE_IMAGE_SIZE) throw new Error("حجم الصورة يتجاوز ٥ ميجابايت");
    chunks.push(bytes);
  }
  const input = Buffer.concat(chunks);
  const actual = await sharp(input, { limitInputPixels: 16000000 }).metadata();
  if (!["jpeg", "png", "webp"].includes(actual.format ?? "")) throw new Error("صيغة الصورة غير مدعومة");
  const clean = await sharp(input, { limitInputPixels: 16000000 }).rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 }).toBuffer();
  const servingPath = await storage.uploadBuffer(clean, "image/webp", "webp");
  const path = servingPath.replace(/^\/api\/storage/, "");
  await storage.trySetObjectEntityAclPolicy(path, { owner: `photographer:${id}`, visibility: "public" });
  await file.delete({ ignoreNotFound: true });
  return { objectPath: path };
}
export async function ownsProfileImage(id: number, path?: string) {
  if (!path) return true;
  try {
    const file = await storage.getObjectEntityFile(path);
    const acl = await getObjectAclPolicy(file);
    return acl?.owner === `photographer:${id}` && acl.visibility === "public";
  } catch { return false; }
}
