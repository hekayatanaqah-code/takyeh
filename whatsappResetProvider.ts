// @ts-ignore
import { sendTaqnyatOTP } from "./taqnyatWhatsApp";

export type PreparedResetSender = {
  send(destination: string, resetUrl: string): Promise<void>;
};

export type ResetLinkProvider = {
  prepare(): Promise<PreparedResetSender | null>;
};

export const taqnyatWhatsAppResetProvider: ResetLinkProvider = {
  async prepare() {
    return {
      async send(destination: string, resetCode: string) {
        const result = await sendTaqnyatOTP(destination, resetCode);
        if (result && result.success === false) {
          throw new Error(result.error || "whatsapp_otp_delivery_failed");
        }
      },
    };
  },
};
