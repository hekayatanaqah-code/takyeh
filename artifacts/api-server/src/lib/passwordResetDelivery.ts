import { sendTaqnyatOTP } from "./taqnyatWhatsApp"; // استدعاء ملف تقنية للواتساب

export type PreparedResetSender = {
  send(destination: string, resetUrl: string): Promise<void>;
};

export type ResetLinkProvider = {
  prepare(): Promise<PreparedResetSender | null>;
};

// إنشاء مزود واتساب نشط باستخدام بوابة taqnyat.sa
export const taqnyatWhatsAppResetProvider: ResetLinkProvider = {
  async prepare() {
    return {
      async send(destination, resetCode) {
        // استخدام دالة taqnyatWhatsApp لإرسال الرمز مباشرة لرقم الجوال
        const result = await sendTaqnyatOTP(destination, resetCode);
        if (!result.success) {
          throw new Error(result.error || "whatsapp_otp_delivery_failed");
        }
      },
    };
  },
};
