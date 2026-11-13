import { createHash, randomInt } from "node:crypto";
import { sendTaqnyatOTP } from "../../../../taqnyatWhatsApp.js";

export function normalizePhoneOtp(value: unknown): string {
  return String(value ?? "").trim().replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/\s/g, "");
}

export function hashPhoneOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// The caller owns a transaction: rollback storage if delivery is rejected.
// Generate once, persist its hash, and send that exact same code.
export async function issuePhoneOtp(
  phone: string,
  persist: (hash: string, expiresAt: Date) => Promise<void>,
  send: typeof sendTaqnyatOTP = sendTaqnyatOTP,
) {
  const code = String(randomInt(1000, 10000));
  await persist(hashPhoneOtp(code), new Date(Date.now() + 10 * 60 * 1000));
  const delivery = await send(phone, code);
  if (!delivery.success) throw new Error("PHONE_OTP_DELIVERY_FAILED");
}
