import { normalizeRecoveryEmail } from "./passwordRecovery";

/** Each administrator receives account mail exclusively at their own saved address. */
export function adminRecoveryDestination(
  account: { email: string | null; is_super_admin: boolean },
): string | null {
  return normalizeRecoveryEmail(String(account.email ?? ""));
}
