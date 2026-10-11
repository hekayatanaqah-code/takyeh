import { whatsappDigits } from "./utils";

export function sanitizeInvitePhone(value: string): string {
  return whatsappDigits(value).slice(0, 10);
}

export function validInvitePhone(value: string): boolean {
  return /^05[0-9]{8}$/.test(value);
}
