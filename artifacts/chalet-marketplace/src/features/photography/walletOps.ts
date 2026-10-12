/**
 * Financial safety helpers for wallet payments.
 * A wallet debit whose response was lost must be resumed with the SAME
 * identifier (checkoutId / bookingId) — never by creating a new one.
 */
import { useCallback, useEffect, useState } from "react";
import { API } from "./shared";

/** Error carrying whether the server definitively rejected (no charge) or the outcome is unknown. */
export class WalletOpError extends Error {
  constructor(message: string, public readonly definite: boolean, public readonly status: number) { super(message); }
}

/** Definitive no-charge rejection: explicit 4xx except timeout/rate-limit. */
const isDefinite = (status: number) => status >= 400 && status < 500 && status !== 408 && status !== 425 && status !== 429;

export async function walletCall<T>(url: string, body: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
  } catch {
    throw new WalletOpError("انقطع الاتصال قبل وصول رد الخادم؛ نتيجة الدفع غير معروفة بعد.", false, 0);
  }
  let j: unknown = null;
  try { j = await r.json(); } catch { j = null; }
  if (r.ok) {
    if (j == null) throw new WalletOpError("وصل رد غير مكتمل من الخادم؛ نتيجة الدفع غير معروفة بعد.", false, r.status);
    return j as T;
  }
  const msg = (j as { error?: string } | null)?.error || (isDefinite(r.status) ? "رفض الخادم العملية" : "خطأ مؤقت في الخادم");
  throw new WalletOpError(msg, isDefinite(r.status), r.status);
}
export const photoWalletUrl = (path: string) => `${API}${path}`;

export const isUncertain = (e: unknown) => !(e instanceof WalletOpError && e.definite);

/* ── Owner-scoped persistent markers (survive reload / modal reopen) ── */
export interface SubWalletMarker { checkoutId: string; plan: string; amountHalala: number; createdAt: string }
export interface BookingWalletMarker { bookingId: number; packageId: string; activityKey: string; startAt: string; endAt: string; priceHalalas: number; createdAt: string }

const keyFor = (kind: "sub" | "booking", ownerId: string) => `wallet-op:v1:${kind}:${ownerId}`;

function read<T>(kind: "sub" | "booking", ownerId: string | null | undefined, valid: (v: any) => boolean): T | null {
  if (!ownerId) return null;
  try {
    const raw = window.localStorage.getItem(keyFor(kind, ownerId));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return valid(v) ? (v as T) : null;
  } catch { return null; }
}
function write(kind: "sub" | "booking", ownerId: string, v: unknown): boolean {
  try { window.localStorage.setItem(keyFor(kind, ownerId), JSON.stringify(v)); return true; } catch { return false; }
}
function remove(kind: "sub" | "booking", ownerId: string) {
  try { window.localStorage.removeItem(keyFor(kind, ownerId)); } catch { /* ignore */ }
}

const validSub = (v: any) => typeof v?.checkoutId === "string" && !!v.checkoutId && typeof v?.plan === "string";
const validBooking = (v: any) => Number.isInteger(v?.bookingId) && v.bookingId > 0;

function useMarker<T>(kind: "sub" | "booking", ownerId: string | null | undefined, valid: (v: any) => boolean) {
  const [value, setValue] = useState<T | null>(() => read<T>(kind, ownerId, valid));
  useEffect(() => { setValue(read<T>(kind, ownerId, valid)); }, [kind, ownerId, valid]);
  const save = useCallback((v: T) => { if (!ownerId) return false; const ok = write(kind, ownerId, v); setValue(v); return ok; }, [kind, ownerId]);
  const clear = useCallback(() => { if (ownerId) remove(kind, ownerId); setValue(null); }, [kind, ownerId]);
  /** Re-read storage (e.g. modal reopen). */
  const refresh = useCallback(() => setValue(read<T>(kind, ownerId, valid)), [kind, ownerId, valid]);
  return { value, save, clear, refresh };
}

export const useSubWalletMarker = (ownerId: string | null | undefined) => useMarker<SubWalletMarker>("sub", ownerId, validSub);
export const useBookingWalletMarker = (ownerId: string | null | undefined) => useMarker<BookingWalletMarker>("booking", ownerId, validBooking);
