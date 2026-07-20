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

/* ── Monthly / Yearly Report Email ──────────────────────────── */
function toArDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[+d]);
}

function fmtAmt(amount: number): string {
  const abs = Math.abs(Math.round(amount));
  return toArDigits(abs.toLocaleString("en")) + " ر.س";
}

function fmtSigned(amount: number): string {
  const rounded = Math.round(amount);
  if (rounded >= 0) return `+${fmtAmt(rounded)}`;
  return `(${fmtAmt(Math.abs(rounded))})`;
}

export async function sendReportEmail(opts: {
  to: string;
  chaletName: string;
  monthLabel: string;
  pdfUrl: string;
  viewMode: "monthly" | "yearly";
  report?: {
    totalBookings: number;
    occupancyRate: number;
    totalDays: number;
    daysInMonth: number;
    slotStats: { morning: number; evening: number; full_day: number };
    topSlot: string;
  } | null;
  financial?: { totalRevenue: number; totalExpenses: number; netProfit: number } | null;
  year?: string;
  yearlyTotals?: { revenue: number; expenses: number; netProfit: number } | null;
}): Promise<boolean> {
  const transport = getTransport();
  if (!transport) {
    console.log(`[Report Email] SMTP not configured — skipping send to ${opts.to}`);
    return false;
  }

  const { to, chaletName, monthLabel, pdfUrl, viewMode, report, financial, year, yearlyTotals } = opts;

  const isMonthly = viewMode === "monthly";
  const subject = isMonthly
    ? `تقرير شهري - ${chaletName} - ${monthLabel}`
    : `التقرير السنوي - ${chaletName} - ${year ?? monthLabel}`;

  /* ── Build slot distribution rows ── */
  const slotDefs = [
    { key: "morning",  icon: "🌅", label: "صباحي" },
    { key: "evening",  icon: "🌙", label: "مسائي" },
    { key: "full_day", icon: "☀️", label: "يوم كامل" },
  ] as const;
  let slotSection = "";
  if (isMonthly && report?.slotStats) {
    const total = report.totalBookings || 1;
    const rows = slotDefs.map(({ key, icon, label }) => {
      const count = report.slotStats[key] ?? 0;
      const pct = Math.round((count / total) * 100);
      const isTop = key === report.topSlot && count > 0;
      return `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151;">${icon} ${label}${isTop ? ' <span style="background:#f3ede4;color:#8C6246;font-size:10px;padding:1px 6px;border-radius:4px;font-weight:700;">الأعلى</span>' : ""}</td>
          <td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:700;color:#111;">${toArDigits(pct)}٪</td>
          <td style="padding:8px 12px;text-align:center;font-size:13px;color:#6b7280;">${toArDigits(count)} حجز</td>
        </tr>`;
    }).join("");
    slotSection = `
      <div style="margin-top:20px;">
        <p style="font-size:12px;font-weight:700;color:#8C6246;margin:0 0 8px;text-transform:uppercase;letter-spacing:.5px;">توزيع الفترات الزمنية</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #e8e2d0;border-radius:8px;overflow:hidden;">
          <thead><tr style="background:#f3ede4;">
            <th style="padding:8px 12px;text-align:right;font-size:11px;color:#8C6246;">الفترة</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#8C6246;">النسبة</th>
            <th style="padding:8px 12px;text-align:center;font-size:11px;color:#8C6246;">العدد</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  /* ── Build main KPI section ── */
  let kpiSection = "";
  if (isMonthly && report) {
    kpiSection = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
        <tr>
          <td style="width:50%;padding:6px 0;color:#6b7280;font-size:13px;">عدد الحجوزات</td>
          <td style="padding:6px 0;font-weight:700;font-size:13px;">${toArDigits(report.totalBookings)} حجز</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">نسبة الإشغال</td>
          <td style="padding:6px 0;font-weight:700;font-size:13px;">${toArDigits(report.occupancyRate)}٪ (${toArDigits(report.totalDays)} من ${toArDigits(report.daysInMonth)} يوم)</td>
        </tr>
        ${financial ? `
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">إجمالي الإيرادات</td>
          <td style="padding:6px 0;font-weight:700;font-size:13px;color:#15803d;">${fmtAmt(financial.totalRevenue)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">إجمالي المصروفات</td>
          <td style="padding:6px 0;font-weight:700;font-size:13px;color:#dc2626;">${fmtAmt(financial.totalExpenses)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">صافي الربح</td>
          <td style="padding:6px 0;font-weight:800;font-size:14px;${financial.netProfit >= 0 ? "color:#15803d" : "color:#dc2626"};">${fmtSigned(financial.netProfit)}</td>
        </tr>` : ""}
      </table>`;
  } else if (!isMonthly && yearlyTotals) {
    kpiSection = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:4px;">
        <tr>
          <td style="width:50%;padding:6px 0;color:#6b7280;font-size:13px;">إجمالي الإيرادات السنوية</td>
          <td style="padding:6px 0;font-weight:700;font-size:13px;color:#15803d;">${fmtAmt(yearlyTotals.revenue)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">إجمالي المصروفات السنوية</td>
          <td style="padding:6px 0;font-weight:700;font-size:13px;color:#dc2626;">${fmtAmt(yearlyTotals.expenses)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6b7280;font-size:13px;">صافي الربح السنوي</td>
          <td style="padding:6px 0;font-weight:800;font-size:14px;${yearlyTotals.netProfit >= 0 ? "color:#15803d" : "color:#dc2626"};">${fmtSigned(yearlyTotals.netProfit)}</td>
        </tr>
      </table>`;
  }

  const html = `
    <div dir="rtl" style="font-family:Arial,Tahoma,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;border-radius:12px;overflow:hidden;">
      <div style="background:#8C6246;padding:28px 32px;text-align:center;">
        <p style="color:#e8d5c4;font-size:22px;font-weight:900;margin:0;">تكية</p>
        <p style="color:#e8d5c4;margin:6px 0 0;font-size:14px;">${isMonthly ? "التقرير الشهري" : "التقرير السنوي"} – ${monthLabel ?? year}</p>
      </div>
      <div style="background:#fff;padding:28px 32px;border:1px solid #e2e8f0;border-top:none;">
        <h2 style="margin:0 0 18px;font-size:17px;font-weight:800;color:#111;border-bottom:2px solid #f3ede4;padding-bottom:10px;">
          📊 ${chaletName}
        </h2>
        ${kpiSection}
        ${slotSection}
        <div style="margin-top:24px;padding:14px 16px;background:#fef9f5;border:1px solid #e8d5c4;border-radius:8px;font-size:13px;color:#6b7280;">
          📎 التقرير الكامل مرفق بهذا البريد كملف PDF — يمكنك فتحه وتحميله مباشرة من المرفقات.
        </div>
      </div>
      <div style="padding:16px 32px;text-align:center;color:#9ca3af;font-size:11px;background:#f8fafc;border-top:1px solid #e2e8f0;">
        ${chaletName} — عبر منصة تكية
      </div>
    </div>`;

  /* ── Fetch PDF and attach ── */
  let pdfBuffer: Buffer | undefined;
  try {
    const resp = await fetch(pdfUrl);
    if (resp.ok) pdfBuffer = Buffer.from(await resp.arrayBuffer());
  } catch (fetchErr) {
    console.error("[Report Email] Failed to fetch PDF:", fetchErr);
  }

  const safeName = chaletName.replace(/[^\u0600-\u06FF\w]/g, "_");
  const attachments = pdfBuffer
    ? [{ filename: `تقرير_${safeName}_${monthLabel ?? year}.pdf`, content: pdfBuffer, contentType: "application/pdf" }]
    : [];

  try {
    await transport.sendMail({
      from: `تكية <${process.env.SMTP_USER}>`,
      to: to.trim(),
      subject,
      html,
      attachments,
    });
    return true;
  } catch (err) {
    console.error(`[Report Email] sendMail failed:`, err);
    return false;
  }
}

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
