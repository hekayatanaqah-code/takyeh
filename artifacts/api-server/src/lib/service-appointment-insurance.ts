import { z } from "zod";

// Omission means "use the service default" on creation / "leave unchanged" on edit.
// An explicit blank or null means the owner waived insurance for this booking.
export const serviceAppointmentInsuranceAmount = z.string().trim()
  .refine(value => value === "" || (/^\d+(?:\.\d{1,2})?$/.test(value) && Number.isFinite(Number(value))),
    "مبلغ التأمين يجب أن يكون رقماً صالحاً يساوي صفراً أو أكبر")
  .transform(value => value || "0")
  .nullable().optional();

export function initialAppointmentInsurance(
  provider: { requiresInsurance: boolean; insuranceAmount: string | null },
  override: string | null | undefined,
) {
  if (!provider.requiresInsurance) return null;
  return override === undefined ? provider.insuranceAmount : (override ?? "0");
}
