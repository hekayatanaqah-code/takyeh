import { CreateQuickSaleBody } from "@workspace/api-zod";
import { z } from "zod";
import { normalizeCustomerPhone } from "./customerPhone";

export const quickSaleInput = CreateQuickSaleBody.extend({
  clientName: z.string().trim().max(150).default(""),
  clientPhone: z.string().min(1, "جوال العميل مطلوب").max(30)
    .regex(/^[+\d٠-٩۰-۹\s()-]+$/, "جوال العميل لا يقبل الحروف").transform(normalizeCustomerPhone)
    .refine(value => /^05\d{8}$/.test(value), "جوال العميل مطلوب: أدخل ١٠ أرقام تبدأ بـ ٠٥"),
  notes: z.string().trim().max(1000).default(""),
  dateStr: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }, "التاريخ غير صالح"),
  idempotencyKey: z.string().uuid(),
}).superRefine((sale, ctx) => {
  sale.items.forEach((line, index) => {
    if (!line.name.trim()) ctx.addIssue({ code: "custom", path: ["items", index, "name"], message: "اسم المنتج مطلوب" });
    if (Math.abs(line.unitPrice * 100 - Math.round(line.unitPrice * 100)) > 0.000001) {
      ctx.addIssue({ code: "custom", path: ["items", index, "unitPrice"], message: "السعر يدعم منزلتين عشريتين" });
    }
  });
  if (quickSaleTotalCents(sale.items) > 999999999999) {
    ctx.addIssue({ code: "custom", path: ["items"], message: "إجمالي العملية يتجاوز الحد المسموح" });
  }
});

export function quickSaleTotalCents(items: Array<{ quantity: number; unitPrice: number }>) {
  return items.reduce((total, item) => total + Math.round(item.unitPrice * 100) * item.quantity, 0);
}
