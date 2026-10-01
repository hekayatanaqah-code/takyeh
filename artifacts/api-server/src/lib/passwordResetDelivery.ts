import {
  createBroadcastSmtpTransport,
  isSafeSmtpTransport,
  loadBroadcastSmtpConfig,
  resolvePublicSmtpAddresses,
  verifyBroadcastSmtpConfig,
  type BroadcastSmtpConfig,
} from "./broadcast-smtp-config";

export type PreparedResetSender = {
  send(destination: string, resetUrl: string): Promise<void>;
};

export type ResetLinkProvider = {
  prepare(): Promise<PreparedResetSender | null>;
};

type SmtpTransportLike = {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
  close(): void;
};

export type PasswordResetEmailDependencies = {
  loadConfig(): Promise<BroadcastSmtpConfig | null>;
  verifyConfig(config: BroadcastSmtpConfig): Promise<boolean>;
  resolveAddresses(host: string): Promise<string[]>;
  createTransport(config: BroadcastSmtpConfig, resolvedAddress: string): SmtpTransportLike;
};

const defaultEmailDependencies: PasswordResetEmailDependencies = {
  async loadConfig() {
    const loaded = await loadBroadcastSmtpConfig();
    return loaded.config;
  },
  verifyConfig: verifyBroadcastSmtpConfig,
  resolveAddresses: resolvePublicSmtpAddresses,
  createTransport: (config, resolvedAddress) => createBroadcastSmtpTransport(config, resolvedAddress),
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function createPasswordResetEmailProvider(
  dependencies: PasswordResetEmailDependencies = defaultEmailDependencies,
): ResetLinkProvider {
  return {
    async prepare() {
      let config: BroadcastSmtpConfig | null;
      let address: string;
      try {
        config = await dependencies.loadConfig();
        if (!config || !isSafeSmtpTransport(config.port, config.secure)) return null;
        if (!await dependencies.verifyConfig(config)) return null;
        [address] = await dependencies.resolveAddresses(config.host);
        if (!address) return null;
      } catch {
        return null;
      }

      return {
        async send(destination, resetUrl) {
          const transport = dependencies.createTransport(config!, address);
          try {
            const link = escapeHtml(resetUrl);
            await transport.sendMail({
              from: config!.fromAddress,
              to: destination,
              subject: "رابط إعادة تعيين كلمة المرور",
              text: `لإعادة تعيين كلمة المرور، افتح الرابط التالي:\n${resetUrl}\n\nينتهي الرابط خلال ساعة.`,
              html: `<div dir="rtl"><p>لإعادة تعيين كلمة المرور، افتح الرابط التالي:</p><p><a href="${link}">إعادة تعيين كلمة المرور</a></p><p>ينتهي الرابط خلال ساعة.</p></div>`,
            });
          } catch {
            /* SMTP errors can include credentials and message details; never surface or log them. */
            throw new Error("password_reset_email_delivery_failed");
          } finally {
            transport.close();
          }
        },
      };
    },
  };
}

/* No WhatsApp provider is configured in this application. Keep an explicit
   provider seam; do not claim delivery or mint a usable token without one. */
export const unavailableWhatsAppResetProvider: ResetLinkProvider = {
  async prepare() {
    return null;
  },
};