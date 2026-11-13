export function sendTaqnyatOTP(phone: string, otpCode: string): Promise<{
  success: boolean;
  error?: string;
  data?: unknown;
}>;
