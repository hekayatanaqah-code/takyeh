import { normalizeRecoveryEmail } from "./passwordRecovery";

/** Never send delegated staff recovery to the platform's emergency mailbox. */
export function adminRecoveryDestination(
  account: { email: string | null; is_super_admin: boolean },
  fallbackEmail: string | undefined,
): string | null {
  const stored = String(account.email ?? "").trim();
  // A malformed nonempty saved address is not permission to redirect recovery elsewhere.
  if (stored) return normalizeRecoveryEmail(stored);
  return account.is_super_admin ? normalizeRecoveryEmail(fallbackEmail ?? "") : null;
}
