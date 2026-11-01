/** Apple Pay has no merchant-validation configuration in add-on checkout.
 * Explicit methods prevent the SDK's default Apple Pay configuration errors
 * from replacing the entire payment form. Recurring consent remains card-only.
 */
export function addonCheckoutMethods(recurringConsent: boolean): string[] {
  return recurringConsent ? ["creditcard"] : ["creditcard", "stcpay"];
}

/** Never expose gateway diagnostics or untranslated provider messages to owners. */
export function addonCheckoutError(message: string | null | undefined): string {
  if (!message || /[a-z]/i.test(message)) {
    return "تعذّر إكمال العملية حالياً. يرجى المحاولة مجدداً أو التواصل مع الدعم. إذا سبق الدفع، أعد التحقق من حالته قبل المحاولة مرة أخرى.";
  }
  return message;
}
