export interface AddonService {
  id: number; name: string; price: string; unit: string; maxQuantity: number | null;
}
export interface AddonQuantity { id: number; quantity: number }

/** Booking snapshots retain line totals, so existing reports/contracts stay correct. */
export function resolveAddonQuantities(services: AddonService[], ids: number[], quantities: AddonQuantity[] = []) {
  if (new Set(ids).size !== ids.length || new Set(quantities.map(item => item.id)).size !== quantities.length) {
    throw new Error("لا يمكن تكرار الخدمة؛ استخدم حقل الكمية.");
  }
  if (services.length !== ids.length || quantities.some(item => !ids.includes(item.id))) {
    throw new Error("إحدى الخدمات غير متاحة لهذا العقار؛ حدّث قائمة الخدمات.");
  }
  return ids.map(id => {
    const service = services.find(item => item.id === id)!;
    const quantity = quantities.find(item => item.id === id)?.quantity ?? 1;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000) throw new Error("كمية الخدمة غير صالحة.");
    if (service.maxQuantity !== null && quantity > service.maxQuantity) {
      throw new Error(`الكمية المطلوبة لخدمة «${service.name}» تتجاوز المتاح لكل حجز (${service.maxQuantity.toLocaleString("ar-SA")}).`);
    }
    return {
      id, quantity, unitPrice: service.price, unit: service.unit,
      name: quantity > 1 ? `${service.name} (الكمية: ${quantity.toLocaleString("ar-SA")})` : service.name,
      price: (Math.round(Number(service.price) * 100) * quantity / 100).toFixed(2),
    };
  });
}
