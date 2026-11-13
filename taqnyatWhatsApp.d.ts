export function isTaqnyatAccepted(httpOk: boolean, data: unknown): boolean;
export function sendTaqnyatOTP(phone: string, otpCode: string): Promise<{
  success: boolean;
  error?: string;
  data?: unknown;
}>;
