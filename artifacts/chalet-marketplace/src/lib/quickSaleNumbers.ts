const EASTERN = "٠١٢٣٤٥٦٧٨٩";
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";

/** Controlled text inputs: no signs, exponents, whitespace or arbitrary text. */
export function quickSaleNumericInput(value: string, decimal = false): string {
  const latin = value.replace(/[٠-٩]/g, digit => String(EASTERN.indexOf(digit)))
    .replace(/[۰-۹]/g, digit => String(PERSIAN.indexOf(digit))).replace(/٫/g, ".");
  const digits = latin.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, "");
  const [integer, ...fraction] = digits.split(".");
  const normalized = decimal && fraction.length ? `${integer}.${fraction.join("").slice(0, 2)}` : integer;
  return normalized.replace(/[0-9]/g, digit => EASTERN[Number(digit)]).replace(".", "٫");
}

export function quickSalePhone(value: string): string {
  let digits = quickSaleNumericInput(value).replace(/[٠-٩]/g, digit => String(EASTERN.indexOf(digit)));
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("966") && digits.length === 12) digits = `0${digits.slice(3)}`;
  if (/^5\d{8}$/.test(digits)) digits = `0${digits}`;
  return digits;
}
