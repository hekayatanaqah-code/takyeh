/** Security notices are transactional: marketing opt-outs must not suppress them.
 * The integration must supply an authenticated sender before emergency resets
 * are enabled. Never pretend that a queued/local notice is a WhatsApp message. */
export interface OwnerSecuritySender {
  send(message: { to: string; body: string }): Promise<{ messageId: string }>;
}

export const ownerSecurityNotification: {
  prepare(): Promise<OwnerSecuritySender | null>;
} = {
  // WhatsApp Business has not been connected to this workspace yet.
  async prepare() { return null; },
};

export const ownerPasswordChangedMessage =
  "تم تغيير كلمة المرور لحسابك بواسطة الدعم الفني. يرجى مراجعة حسابك فوراً. إذا لم تطلب هذا التغيير، تواصل مع الدعم عبر القنوات الرسمية للمنصة.";
