export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function profileImageError(file: { size: number; type: string }): string | null {
  if (file.size > MAX_PROFILE_IMAGE_BYTES) return "حجم الصورة يتجاوز الحد المسموح (٥ ميجابايت). اختر صورة أصغر.";
  if (!IMAGE_TYPES.includes(file.type)) return "الصيغ المسموحة: JPEG أو PNG أو WebP";
  return null;
}
