import { toAr } from "@/lib/utils";


export const toArN = (v: string | number) => String(v).replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[+d]);
export const fromArN = (v: string) => v.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[^0-9.]/g, '');

export function serviceDurationLabel(value: string | null | undefined, durationUnit?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const normalized = raw.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(",", ".");
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return `التوقيت: ${toAr(raw)}`;

  const amount = Number(normalized);
  const amountLabel = toArN(Number.isInteger(amount) ? amount : normalized);
  const isDays = durationUnit === "days";
  const unit = isDays
    ? amount === 1 ? "يوم" : amount === 2 ? "يومان" : amount >= 3 && amount <= 10 ? "أيام" : "يوماً"
    : amount === 1 ? "ساعة" : amount === 2 ? "ساعتان" : amount >= 3 && amount <= 10 ? "ساعات" : "ساعة";
  return `المدة: ${amountLabel} ${unit}`;
}
