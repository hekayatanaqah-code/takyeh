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
