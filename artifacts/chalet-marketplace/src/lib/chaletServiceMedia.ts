export const SERVICE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export function serviceImageError(file: { type: string; size: number }): string | null {
  if (!file.type.startsWith("image/")) return "يرجى اختيار ملف صورة.";
  if (file.size > SERVICE_IMAGE_MAX_BYTES) return "الحد الأقصى للصورة ٢ ميجابايت (2MB).";
  return null;
}
export function moveServicePhoto<T>(photos: T[], from: number, to: number): T[] {
  if (from < 0 || to < 0 || from >= photos.length || to >= photos.length) return photos;
  const next = [...photos];
  const [photo] = next.splice(from, 1);
  next.splice(to, 0, photo);
  return next;
}
