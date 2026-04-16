import nodemailer from "nodemailer";

function getTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendAdminNewSubmissionEmail(data: {
  nameAr: string;
  whatsappNumber: string;
  location: string;
  pricePerNight: string;
  mapsUrl?: string | null;
  submissionId: number;
}) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const transport = getTransport();
  if (!transport) return;

  const subject = `طلب شاليه جديد: ${data.nameAr}`;
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1e293b; padding: 24px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #f59e0b; margin: 0; font-size: 20px;">🏡 طلب شاليه جديد</h1>
        <p style="color: #94a3b8; margin: 8px 0 0;">شاليهات القصيم — لوحة الإدارة</p>
      </div>
      <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 8px 8px; border: 1px solid #e2e8f0;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr><td style="padding: 8px 0; color: #64748b; width: 40%;">اسم الشاليه</td><td style="padding: 8px 0; font-weight: bold;">${data.nameAr}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">رقم الواتساب</td><td style="padding: 8px 0; font-weight: bold; direction: ltr;">${data.whatsappNumber}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">الموقع</td><td style="padding: 8px 0;">${data.location}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">متوسط السعر</td><td style="padding: 8px 0;">${data.pricePerNight} ر.س / ليلة</td></tr>
          ${data.mapsUrl ? `<tr><td style="padding: 8px 0; color: #64748b;">الخريطة</td><td style="padding: 8px 0;"><a href="${data.mapsUrl}">${data.mapsUrl}</a></td></tr>` : ""}
        </table>
        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
          <a href="${process.env.PUBLIC_URL ?? ""}/admin" style="background: #f59e0b; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
            مراجعة الطلب في لوحة التحكم
          </a>
        </div>
      </div>
    </div>
  `;

  try {
    await transport.sendMail({
      from: `شاليهات القصيم <${process.env.SMTP_USER}>`,
      to: adminEmail,
      subject,
      html,
    });
  } catch (err) {
    console.error("[email] Failed to send admin notification:", err);
  }
}

/* ── OTP Email ─────────────────────────────────────────────── */
const DEFAULT_OTP_TEMPLATE = `مرحباً {NAME}،

شكراً لتسجيلك في منصة تكيّة. رمز التحقق الخاص بك لإتمام إنشاء حسابك هو:

{OTP}

هذا الرمز صالح لمدة ١٠ دقائق فقط.
إذا لم تطلب هذا الرمز، يرجى تجاهل هذا البريد.

منصة تكيّة — إدارة الشاليهات والمنتجعات في القصيم`;

export async function sendOtpEmail(
  to: string,
  name: string,
  code: string,
  options?: { template?: string; subject?: string }
): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.log(`[OTP] ✉️  Code for ${to}: ${code}  (SMTP not configured — console fallback)`);
    return false;
  }

  /* Use custom template if provided, else built-in HTML */
  let html: string;
  if (options?.template?.trim()) {
    const text = options.template
      .replace(/\{NAME\}/g, name)
      .replace(/\{OTP\}/g, code);
    /* Wrap plain text template in minimal HTML */
    html = `<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 32px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
      <pre style="white-space: pre-wrap; font-family: inherit; color: #374151; font-size: 15px; line-height: 1.7; margin: 0;">${text}</pre>
    </div>`;
  } else {
    html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; background: #f8fafc; padding: 0; border-radius: 12px; overflow: hidden;">
      <div style="background: #16a34a; padding: 24px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 24px; font-weight: bold;">تكيّة</h1>
        <p style="color: #bbf7d0; margin: 6px 0 0; font-size: 14px;">رمز التحقق من البريد الإلكتروني</p>
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="color: #374151; margin: 0 0 16px; font-size: 15px;">مرحباً ${name}،</p>
        <p style="color: #374151; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
          شكراً لتسجيلك في منصة تكيّة. رمز التحقق الخاص بك لإتمام إنشاء حسابك هو:
        </p>
        <div style="background: #f0fdf4; border: 2px dashed #16a34a; border-radius: 12px; padding: 24px; text-align: center; margin: 0 0 28px;">
          <span style="font-size: 44px; font-weight: 900; color: #15803d; letter-spacing: 14px; font-family: 'Courier New', monospace;">${code}</span>
        </div>
        <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin: 0 0 24px;">
          <p style="color: #92400e; font-size: 13px; margin: 0 0 6px;">⏱️ هذا الرمز صالح لمدة <strong>١٠ دقائق</strong> فقط</p>
          <p style="color: #92400e; font-size: 13px; margin: 0;">🔒 إذا لم تطلب هذا الرمز، يرجى تجاهل هذا البريد</p>
        </div>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">منصة تكيّة — إدارة الشاليهات والمنتجعات في القصيم</p>
      </div>
    </div>
  `;
  }

  const subject = options?.subject?.trim() || `رمز التحقق: ${code} — منصة تكيّة`;

  try {
    await transport.sendMail({
      from: `تكيّة <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error(`[OTP] Email failed for ${to}:`, err);
    console.log(`[OTP] Fallback — Code for ${to}: ${code}`);
    return false;
  }
}

/* ── Welcome Email ─────────────────────────────────────────── */
const DEFAULT_WELCOME_TEMPLATE = `مرحباً {NAME}،

يسعدنا انضمامك إلى منصة تكيّة! 🎉

حسابك الآن قيد المراجعة من فريق الإدارة. بعد التفعيل، يمكنك البدء بالخطوات التالية:

1️⃣  أضف شاليهك — أدخل الصور والتفاصيل والموقع
2️⃣  حدّد الأسعار والمواسم — يومي، نهاية أسبوع، مواسم خاصة
3️⃣  استقبل الحجوزات — وتابعها مباشرة من لوحة التحكم

سنُرسل إليك إشعاراً فور تفعيل حسابك.

فريق تكيّة ❤️`;

export async function sendWelcomeEmail(
  to: string,
  name: string,
  options?: { template?: string; subject?: string }
): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.log(`[Welcome] ✉️  Would send welcome email to ${to} (SMTP not configured)`);
    return false;
  }

  const rawTemplate = options?.template?.trim() || DEFAULT_WELCOME_TEMPLATE;
  const text = rawTemplate.replace(/\{NAME\}/g, name);
  const subject = options?.subject?.trim() || `مرحباً بك في منصة تكيّة 🎉`;

  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; background: #f8fafc; padding: 0; border-radius: 12px; overflow: hidden;">
      <div style="background: #16a34a; padding: 28px; text-align: center;">
        <h1 style="color: #fff; margin: 0; font-size: 26px; font-weight: bold;">تكيّة</h1>
        <p style="color: #bbf7d0; margin: 8px 0 0; font-size: 15px;">أهلاً بك في عائلة تكيّة 🎉</p>
      </div>
      <div style="background: #fff; padding: 32px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
        <pre style="white-space: pre-wrap; font-family: Arial, sans-serif; color: #374151; font-size: 15px; line-height: 1.8; margin: 0;">${text}</pre>
        <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px; margin: 0; text-align: center;">منصة تكيّة — إدارة الشاليهات والمنتجعات في القصيم</p>
      </div>
    </div>
  `;

  try {
    await transport.sendMail({
      from: `تكيّة <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error(`[Welcome] Email failed for ${to}:`, err);
    return false;
  }
}
