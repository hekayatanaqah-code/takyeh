export function isTaqnyatAccepted(httpOk: boolean, data: unknown): boolean;
export function normalizeTaqnyatPhone(phone: string): string | null;
export function sendTaqnyatTemplate(phone: string, name: string, parameters: string[], language?: string): Promise<{
  success: boolean;
  error?: string;
}>;
export function sendTaqnyatOTP(phone: string, otpCode: string): Promise<{
  success: boolean;
  error?: string;
  data?: unknown;
}>;
