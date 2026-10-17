export type ServiceReceiptAppointment = {
  id?: number | string | null;
  amount?: number | string | null;
  deposit?: number | string | null;
  paymentMethod?: string | null;
  clientIdNumber?: string | null;
};

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";

function toArabicDigits(value: string | number) {
  return String(value).replace(/[0-9]/g, (digit) => ARABIC_DIGITS[Number(digit)]);
}

function toMoneyNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function serviceReceiptNumber(appointment: Pick<ServiceReceiptAppointment, "id">) {
  const numericId = Number(appointment?.id);
  return toArabicDigits(Number.isFinite(numericId) ? String(Math.max(0, Math.trunc(numericId))) : "0");
}

export function servicePaymentMethodLabel(method?: string | null) {
  return method === "transfer" ? "حوالة بنكية" : method === "pos" ? "شبكة / نقاط بيع" : "نقداً";
}

export function serviceReceiptMoney(value?: number | string | null) {
  const formatted = toMoneyNumber(value).toLocaleString("ar-SA-u-nu-arab", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: true,
  });
  return `${toArabicDigits(formatted)} ⃁`;
}

export function getServiceReceiptFinancialSummary(
  appointment: Pick<ServiceReceiptAppointment, "amount" | "deposit" | "paymentMethod">,
) {
  const total = toMoneyNumber(appointment.amount);
  const deposit = toMoneyNumber(appointment.deposit);
  return {
    total,
    deposit,
    remaining: Math.max(0, total - deposit),
    paymentMethodLabel: servicePaymentMethodLabel(appointment.paymentMethod),
  };
}

export function shouldShowServiceClientId(providerRequiresInsurance: boolean) {
  return providerRequiresInsurance;
}

export function getServiceClientIdField(
  providerRequiresInsurance: boolean,
  clientIdNumber?: string | null,
) {
  const value = String(clientIdNumber ?? "").trim();
  if (!shouldShowServiceClientId(providerRequiresInsurance) || !value) return null;
  return { label: "رقم الهوية / الإقامة", value };
}