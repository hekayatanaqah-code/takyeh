import takyahLogoSrc from "@/assets/platform-logo.png";
import QRCode from "qrcode";
import { toAr } from "@/lib/utils";
import { formatDateWithHijri, HIJRI_MONTHS_AR, toHijriComponents } from "@/lib/hijri";
import { finalizePropertyReportHtml } from "@/lib/propertyReportLayout";
import { escapeFinancialReportText } from "@/lib/financialReportActivity";
import { buildPropertyReportClosingHtml, buildPropertyBookingDetailsHtml } from "@/lib/financialReport";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { financialReportPageSlices, FINANCIAL_REPORT_MARGINS_MM } from "@/lib/financialReportPagination";
import { BASE } from "@/components/owner/owner-api";
import { MonthReport, ReportCalendarMode, buildReportFileName, catMap, formatAmount, formatAmountSigned, uploadFile } from "@/components/owner/finance-shared";


/* ── Logo data-URL helper (cached) ── */
let _cachedLogoDataUrl: string | null | undefined = undefined;
export async function getLogoDataUrl(): Promise<string | null> {
  if (_cachedLogoDataUrl !== undefined) return _cachedLogoDataUrl;
  try {
    const resp = await fetch(takyahLogoSrc);
    const blob = await resp.blob();
    _cachedLogoDataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return _cachedLogoDataUrl;
  } catch {
    _cachedLogoDataUrl = null;
    return null;
  }
}

/* ── QR Code helper for report verification links ── */
export async function generateReportQrDataUrl(type: "monthly" | "yearly", period: string): Promise<string | null> {
  try {
    const param = type === "monthly" ? `month=${period}` : `year=${period}`;
    const url = `${window.location.origin}${BASE}/dashboard?tab=reports&view=${type}&${param}`;
    return await QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

/* ── PDF Print Functions ────────────────────── */
export async function printMonthlyReport(
  month: string,
  propertyName: string,
  report: MonthReport | null | undefined,
  financial: { totalRevenue: number; totalInsuranceHeld?: number; totalInsuranceDeducted?: number; totalExpenses: number; netProfit: number; categoryTotals: Record<string, number> } | null | undefined,
  breakdown: ReportBreakdown = null,
  monthTitle: string | null = null,
  isCurrentPeriod = false,
  calMode: ReportCalendarMode = "gregorian",
  hijriMonth?: string,
  showDetails = false,
) {
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return;
  const qr = await generateReportQrDataUrl("monthly", month);
  const logo = await getLogoDataUrl();
  const fileName = buildReportFileName({ viewMode: "monthly", calMode, month, hijriMonth });
  win.document.write(buildMonthlyReportHtml(month, propertyName, report, financial, true, qr, breakdown, monthTitle, logo, isCurrentPeriod, fileName, showDetails));
  win.document.close();
}

export async function printYearlyReport(
  year: string,
  propertyName: string,
  yearly: { monthly: { month: string; revenue: number; expenses: number; netProfit: number }[]; totals: { revenue: number; expenses: number; netProfit: number } } | null | undefined,
  isCustom = false,
  calMode: "hijri" | "gregorian" = "gregorian",
  isShortPeriod = false,
  daysDiff?: number,
  isCurrentPeriod = false,
  fileName?: string,
  showDetails = false,
) {
  if (!yearly) return;
  const win = window.open("", "_blank", "width=794,height=1123");
  if (!win) return;
  const qr = await generateReportQrDataUrl("yearly", year);
  const logo = await getLogoDataUrl();
  const resolvedFileName = fileName ?? buildReportFileName({
    viewMode: "yearly",
    calMode,
    year: calMode === "gregorian" ? year : undefined,
    hijriYear: calMode === "hijri" ? year : undefined,
  });
  win.document.write(buildYearlyReportHtml(year, propertyName, yearly, true, qr, logo, isCustom, calMode, isShortPeriod, daysDiff, isCurrentPeriod, resolvedFileName, showDetails));
  win.document.close();
}

/* ── Shared Report HTML builders (for print + PDF export) ── */
type ReportBreakdown = {
  rows: Array<{ id: number; name: string; date: string; base: number; svc: number; total: number }>;
  totBase: number; totSvc: number; totTotal: number;
} | null;

 export const REPORT_CSS = `*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#111;direction:rtl;text-align:right;}.page{width:750px;padding:22px 36px;background:#fff;}.header{border-bottom:3px solid #8C6246;padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-direction:row;direction:ltr;}.header-brand{flex-shrink:0;}.brand-name{font-size:24px;font-weight:800;color:#8C6246;direction:rtl;}.brand-sub{font-size:11px;color:#666;margin-top:3px;direction:rtl;}.header-center{flex:1;text-align:center;padding:0 16px;direction:rtl;}.report-title{font-size:17px;font-weight:700;text-align:center;}.report-sub{font-size:11px;color:#666;text-align:center;margin-top:3px;}.qr-block{flex-shrink:0;text-align:center;}.qr-img{width:80px;height:80px;display:block;image-rendering:crisp-edges;}.qr-caption{font-size:9px;color:#888;margin-top:3px;direction:rtl;}.current-period-notice{margin:0 0 12px;padding:8px 12px;border:1px solid #fcd34d;border-radius:8px;background:#fffbeb;color:#92400e;font-size:11px;font-weight:600;text-align:right;}.section{margin-bottom:12px;page-break-inside:avoid;break-inside:avoid;}.section-auto{margin-bottom:12px;}.section-title{font-size:14px;font-weight:700;color:#8C6246;margin-bottom:8px;}.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}.kpi-card{background:#faf9f6;border:1px solid #e8e2d0;border-radius:8px;padding:12px 16px;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:flex-start!important;text-align:right!important;direction:rtl!important;}.kpi-label{font-size:11px;color:#333;font-weight:600;margin-bottom:3px;}.kpi-value{font-size:17px;font-weight:700;color:#111;line-height:1.2;}.kpi-note{font-size:10px;color:#555;font-weight:500;margin-top:2px;}.kpi-green{border-color:#86efac!important;}.kpi-red{border-color:#fca5a5!important;}table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;word-wrap:break-word;}th{background:#8C6246;color:#fff;padding:6px 8px;text-align:right;vertical-align:middle;}td{padding:6px 8px;border-bottom:1px solid #ede9dd;word-break:break-word;vertical-align:middle;}tr:nth-child(even) td{background:#faf9f6;}tr.total-row td{font-weight:700;background:#fffbf0;border-top:2px solid #8C6246;}table th,table td{height:38px!important;text-align:right!important;direction:rtl!important;vertical-align:top!important;line-height:1.2!important;}table td{padding-top:2px!important;padding-bottom:8px!important;}table th{padding-top:2px!important;padding-bottom:8px!important;}.total-row{break-inside:avoid;page-break-inside:avoid;}.legend-item{display:inline-flex!important;align-items:center!important;gap:6px!important;}.slot-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;}.slot-chip{background:#faf9f6;border:1px solid #e8e2d0;border-radius:6px;padding:5px 12px;font-size:12px;color:#555;}.footer{margin-top:14px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:7px;}`;

function buildRevBarSvg(dailyRevenue: { day: number; revenue: number }[]): string {
  if (!dailyRevenue || dailyRevenue.length === 0) return "";
  const W = 670, H = 98;
  const maxRev = Math.max(...dailyRevenue.map(d => d.revenue), 1);
  const n = dailyRevenue.length;
  const gap = 2;
  const barW = Math.max(3, Math.floor((W - gap * (n + 1)) / n));
  const bars = dailyRevenue.map((d, i) => {
    const barH = Math.max(2, Math.round((d.revenue / maxRev) * (H - 20)));
    const x = gap + i * (barW + gap);
    const y = H - barH - 16;
    return `<rect x="${x}" y="${y}" width="${barW}" height="${barH}" fill="#8C6246" rx="2" opacity="${d.revenue > 0 ? 1 : 0.25}"/><text x="${x + barW / 2}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#555" font-weight="500">${toAr(d.day)}</text>`;
  }).join("");
  const svgW = gap + n * (barW + gap);
  return `<svg width="${svgW}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="direction:ltr;display:block;">${bars}</svg>`;
}

/* ── Annual bar chart: grouped monthly revenue + expenses bars ── */
function buildMonthlyBarChartSvg(
  monthly: { month: string; revenue: number; expenses: number }[],
  calModeOverride?: "hijri" | "gregorian"
): string {
  if (!monthly || monthly.length === 0) return "";
  const W        = 670;
  const BAR_H    = 100;          // bar area height; baseline sits at y=100
  const LABEL_Y  = BAR_H + 36;  // anchor point: 36px below baseline — guaranteed no overlap
  const H        = LABEL_Y + 72; // room for longest name rotated −45°

  // Full Hijri month names — single line, never truncated
  const HIJRI_FULL = ["محرم","صفر","ربيع الأول","ربيع الآخر","جمادى الأولى","جمادى الآخرة","رجب","شعبان","رمضان","شوال","ذو القعدة","ذو الحجة"];

  const maxVal = Math.max(...monthly.flatMap(m => [m.revenue, m.expenses]), 1);
  // Reverse for RTL display: first month (محرم/يناير) at rightmost position
  const monthsRTL = [...monthly].reverse();
  const n = monthsRTL.length;
  const GROUP_GAP = 5;
  const groupW = Math.floor((W - GROUP_GAP * (n + 1)) / n);
  const barW = Math.max(4, Math.floor((groupW - 3) / 2));

  const bars = monthsRTL.map((m, i) => {
    const gx = GROUP_GAP + i * (groupW + GROUP_GAP);
    const revH = m.revenue > 0 ? Math.max(3, Math.round((m.revenue / maxVal) * BAR_H)) : 0;
    const expH = m.expenses > 0 ? Math.max(3, Math.round((m.expenses / maxVal) * BAR_H)) : 0;
    const parts = m.month.split("-");
    const yearPart = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const isDay = parts.length === 3;
    const resolvedHijri = calModeOverride === "hijri" || (!calModeOverride && yearPart < 1800);
    let label: string;
    if (resolvedHijri && yearPart < 1800) {
      // Hijri key
      label = isDay
        ? `${toAr(parseInt(parts[2], 10))} ${HIJRI_FULL[monthIdx] ?? parts[1]}`
        : (HIJRI_FULL[monthIdx] ?? toAr(monthIdx + 1));
    } else if (resolvedHijri) {
      // Gregorian key, display as Hijri
      try {
        const dt = new Date((isDay ? m.month : m.month + "-15") + "T12:00:00");
        const hc = toHijriComponents(dt);
        label = isDay
          ? `${toAr(hc.day)} ${HIJRI_FULL[hc.month - 1] ?? toAr(hc.month)}`
          : (HIJRI_FULL[hc.month - 1] ?? toAr(hc.month));
      } catch { label = toAr(monthIdx + 1); }
    } else {
      const dt = new Date((isDay ? m.month : m.month + "-15") + "T12:00:00");
      label = isDay
        ? dt.toLocaleDateString("ar-SA", { day: "numeric", month: "short", calendar: "gregory" })
        : dt.toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });
    }
    const cx = gx + groupW / 2;
    // All months: single line, −45° rotation from anchor point, text-anchor="end"
    // so right-end of text sits at (cx, LABEL_Y) and text extends diagonally down-left
    // g-transform pattern: translate to anchor, rotate -45°, draw text from x=0 going left.
    // direction="rtl" + text-anchor="start" anchors the first Arabic char at (cx,LABEL_Y).
    const labelEl = `<g transform="translate(${cx},${LABEL_Y}) rotate(-45)"><text x="0" y="0" direction="rtl" text-anchor="start" font-size="10" font-weight="600" fill="#444" font-family="Segoe UI,Tahoma,Arial,sans-serif">${label}</text></g>`;
    return [
      `<rect x="${gx}" y="${BAR_H - (revH || 1)}" width="${barW}" height="${revH || 1}" fill="#16a34a" rx="2" opacity="${revH > 0 ? "0.85" : "0.12"}"/>`,
      `<rect x="${gx + barW + 3}" y="${BAR_H - (expH || 1)}" width="${barW}" height="${expH || 1}" fill="#dc2626" rx="2" opacity="${expH > 0 ? "0.7" : "0.12"}"/>`,
      labelEl,
    ].join("");
  }).join("");

  const baseline = `<line x1="0" y1="${BAR_H}" x2="${W}" y2="${BAR_H}" stroke="#e8e2d0" stroke-width="1"/>`;

  /* Legend is rendered as HTML outside the SVG — no legend inside SVG */
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-width:${W}px;height:auto;display:block;overflow:visible;">${baseline}${bars}</svg>`;
}

export function buildMonthlyReportHtml(
  month: string,
  propertyName: string,
  report: MonthReport | null | undefined,
  financial: { totalRevenue: number; totalInsuranceHeld?: number; totalInsuranceDeducted?: number; totalExpenses: number; netProfit: number; categoryTotals: Record<string, number> } | null | undefined,
  forPrint = false,
  qrDataUrl: string | null = null,
  breakdown: ReportBreakdown = null,
  monthTitle: string | null = null,
  logoDataUrl: string | null = null,
  isCurrentPeriod = false,
  fileName = "0000.pdf",
  showDetails = false,
): string {
  const monthStr = toAr(monthTitle ?? new Date(month + "-15").toLocaleDateString("ar-SA", { year: "numeric", month: "long", calendar: "gregory" }));
  const _now = new Date();
  const _hc = toHijriComponents(_now);
  const _hijriPrint = `${toAr(_hc.day)} ${HIJRI_MONTHS_AR[_hc.month - 1]} ${toAr(_hc.year)} هـ`;
  const _gregPrint = toAr(_now.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric", calendar: "gregory" })) + " م";
  const printDate = `${_hijriPrint} | ${_gregPrint}`;
  const hijriYear = toAr(_hc.year);
  const gregYear = toAr(_now.getFullYear());
  const catRows = financial && Object.keys(financial.categoryTotals).length > 0
    ? Object.entries(financial.categoryTotals).sort(([, a], [, b]) => b - a).map(([key, amt]) => {
        const cat = catMap[key] ?? { label: key, emoji: "✨" };
        const pct = financial.totalExpenses > 0 ? Math.round((amt / financial.totalExpenses) * 100) : 0;
        return `<tr><td>${cat.emoji} ${cat.label}</td><td>${formatAmount(amt)}</td><td>${toAr(pct)}٪</td></tr>`;
      }).join("") : "";
  const scriptTag = forPrint ? `<script>window.onload=function(){window.print();};<\/script>` : "";
  const qrHtml = qrDataUrl
    ? `<div class="qr-block"><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">مسح للتحقق</div></div>`
    : `<div class="qr-block" style="width:80px;"></div>`;
  const insuranceHeld = financial?.totalInsuranceHeld ?? 0;
  const insuranceDeducted = financial?.totalInsuranceDeducted ?? 0;
  const currentPeriodNotice = isCurrentPeriod
    ? `<div class="current-period-notice">ملاحظة: هذا التقرير يعرض البيانات المالية المحققة حتى تاريخ اليوم ${printDate}.</div>`
    : "";
  const printMediaCss = ""; // Shared final print rules own per-page margins and fragmentation.

  const dailyChartSvg = report?.dailyRevenue && report.dailyRevenue.length > 0
    ? buildRevBarSvg(report.dailyRevenue) : "";

  const slots = report?.slotStats;
  const slotTotal = slots ? ((slots.morning + slots.evening + slots.full_day + slots.unspecified) || 1) : 1;
  const slotPct = (n: number) => Math.round((n / slotTotal) * 100);
  const slotHtml = slots ? [
    slots.morning > 0 ? `<div class="slot-chip">صباحي: ${toAr(slots.morning)} حجز (${toAr(slotPct(slots.morning))}٪)</div>` : "",
    slots.evening > 0 ? `<div class="slot-chip">مسائي: ${toAr(slots.evening)} حجز (${toAr(slotPct(slots.evening))}٪)</div>` : "",
    slots.full_day > 0 ? `<div class="slot-chip">يوم كامل: ${toAr(slots.full_day)} حجز (${toAr(slotPct(slots.full_day))}٪)</div>` : "",
    slots.unspecified > 0 ? `<div class="slot-chip">غير محدد: ${toAr(slots.unspecified)} حجز (${toAr(slotPct(slots.unspecified))}٪)</div>` : "",
  ].filter(Boolean).join("") : "";

  return finalizePropertyReportHtml(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
 <title>${fileName}</title>
<style>${REPORT_CSS}${printMediaCss}</style></head>
<body><div class="page print-container">

<div class="header">
<div class="header-brand">${logoDataUrl ? `<img src="${logoDataUrl}" style="height:68px;width:auto;object-fit:contain;display:block;" alt="تكية" />` : `<span style="font-size:26px;font-weight:900;color:#8C6246;font-family:Segoe UI,Tahoma,Arial,sans-serif;">تكية</span>`}</div>
<div class="header-center"><div class="report-title">التقرير المالي - ${escapeFinancialReportText(propertyName)}</div><div class="report-sub">التقرير الشهري · ${monthStr}</div><div class="report-sub" style="font-size:10px;color:#444;margin-top:4px;">تاريخ إصدار التقرير: ${printDate}</div></div>
${qrHtml}</div>
${currentPeriodNotice}

${financial ? `<div class="section"><div class="section-title">الأداء والملخص المالي</div><div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">
<div class="kpi-card kpi-green"><div class="kpi-label">إجمالي الإيرادات</div><div class="kpi-value" style="font-size:18px">${formatAmount(financial.totalRevenue)}</div><div class="kpi-note">عربون + محصّل + تلفيات</div></div>
<div class="kpi-card" style="border-color:#86efac"><div class="kpi-label">المبالغ المحصّلة فعلياً</div><div class="kpi-value" style="font-size:18px;color:#15803d">${formatAmount(financial.totalRevenue)}</div><div class="kpi-note">ما دخل الحساب فعلاً</div></div>
<div class="kpi-card kpi-red"><div class="kpi-label">إجمالي المصروفات</div><div class="kpi-value" style="font-size:18px">${formatAmount(financial.totalExpenses)}</div><div class="kpi-note">مصروفات + رواتب</div></div>
<div class="kpi-card ${financial.netProfit >= 0 ? "kpi-green" : "kpi-red"}"><div class="kpi-label">صافي الربح</div><div class="kpi-value" style="font-size:18px;${financial.netProfit >= 0 ? "color:#16a34a" : "color:#dc2626"}">${formatAmountSigned(financial.netProfit)}</div><div class="kpi-note">الإيرادات − المصروفات</div></div>
</div>${insuranceDeducted > 0 ? `<div style="margin-top:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;font-weight:700;color:#b91c1c;">✂️ إيرادات تلفيات (محوّلة من التأمين)</span><span style="font-size:16px;font-weight:700;color:#b91c1c;">${formatAmount(insuranceDeducted)}</span></div>` : ""}${insuranceHeld > 0 ? `<div style="margin-top:8px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;font-weight:700;color:#c2410c;">🔒 تأمينات محتجزة (غير محسوبة في الأرباح)</span><span style="font-size:16px;font-weight:700;color:#c2410c;">${formatAmount(insuranceHeld)}</span></div>` : ""}</div>` : ""}

${report ? `<div class="section"><div class="section-title">قنوات الحجز والإشغال</div>
<div class="kpi-grid" style="grid-template-columns:1fr 1fr">
<div class="kpi-card"><div class="kpi-label">🌐 عبر المنصة</div><div class="kpi-value">${toAr(report.platformBookings)}</div><div class="kpi-note">حجز إلكتروني</div></div>
<div class="kpi-card"><div class="kpi-label">📞 من خارج المنصة</div><div class="kpi-value">${toAr(report.externalBookings)}</div><div class="kpi-note">واتساب / مباشر</div></div>
</div></div>` : ""}

${dailyChartSvg ? `<div class="section"><div class="section-title">الإيرادات اليومية</div>${dailyChartSvg}</div>` : ""}

${report ? `<div class="section"><div class="section-title">نسبة الإشغال وتوزيع الفترات</div>
<div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px"><span style="font-size:13px;font-weight:700">نسبة الإشغال</span><span style="font-size:20px;font-weight:800;color:#8C6246;direction:rtl;">${toAr(report.occupancyRate)}٪</span></div><div style="width:100%;background:#f3ede4;border-radius:6px;height:12px"><div style="width:${report.occupancyRate}%;background:#8C6246;height:12px;border-radius:6px;min-width:${report.occupancyRate > 0 ? 4 : 0}px"></div></div><div style="font-size:11px;color:#888;margin-top:4px">${toAr(report.totalDays)} يوم محجوز من أصل ${toAr(report.daysInMonth)} يوم</div></div>
${slotHtml ? `<div class="slot-row" style="margin-top:14px">${slotHtml}</div>` : ""}
</div>` : ""}

${showDetails && catRows ? `<div class="section"><div class="section-title">توزيع المصروفات</div><table><thead><tr><th>الفئة</th><th>المبلغ (ر.س)</th><th>النسبة</th></tr></thead><tbody>${catRows}</tbody></table></div>` : ""}
${buildPropertyBookingDetailsHtml(showDetails, (breakdown?.rows ?? []).map(row => ({ ...row, date: formatDateWithHijri(`${row.date}T12:00:00+03:00`) })))}
${financial ? buildPropertyReportClosingHtml({ revenue: financial.totalRevenue, expenses: financial.totalExpenses, netProfit: financial.netProfit }) : ""}

<div class="footer">منصة تكيّة — تقرير مالي</div>
</div>${scriptTag}</body></html>`, showDetails);
}

export function buildYearlyReportHtml(
  year: string,
  propertyName: string,
  yearly: { monthly: { month: string; revenue: number; expenses: number; netProfit: number }[]; totals: { revenue: number; expenses: number; netProfit: number } },
  forPrint = false,
  qrDataUrl: string | null = null,
  logoDataUrl: string | null = null,
  isCustom = false,
  calMode: "hijri" | "gregorian" = "gregorian",
  isShortPeriod = false,
  daysDiff?: number,
  isCurrentPeriod = false,
  fileName = "0000.pdf",
  showDetails = false,
): string {
  const _nowY = new Date();
  const _hcY = toHijriComponents(_nowY);
  const _hijriPrintY = `${toAr(_hcY.day)} ${HIJRI_MONTHS_AR[_hcY.month - 1]} ${toAr(_hcY.year)} هـ`;
  const _gregPrintY = toAr(_nowY.toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric", calendar: "gregory" })) + " م";
  const printDate = `${_hijriPrintY} | ${_gregPrintY}`;
  const hijriYearY = toAr(_hcY.year);
  const gregYearY = toAr(_nowY.getFullYear());

  const DASH = `<span style="color:#ccc;font-size:14px;line-height:1;">—</span>`;
  const tdBase = `height:38px;padding:10px 8px 4px;vertical-align:top;text-align:right;direction:rtl;line-height:1.2;`;
  const rows = yearly.monthly.map(m => {
    const parts = m.month.split("-");
    const yearPart = parseInt(parts[0], 10);
    const monthIdx = parseInt(parts[1], 10) - 1;
    const isDay = parts.length === 3;
    let label: string;
    if (yearPart < 1800) {
      // Hijri key (month or day)
      if (isDay) {
        const dd = parseInt(parts[2], 10);
        label = `${toAr(dd)} ${HIJRI_MONTHS_AR[monthIdx] ?? parts[1]}`;
      } else {
        label = HIJRI_MONTHS_AR[monthIdx] ?? parts[1];
      }
    } else if (isCustom && calMode === "hijri") {
      try {
        const dt = new Date((isDay ? m.month : m.month + "-15") + "T12:00:00");
        const hc = toHijriComponents(dt);
        label = isDay
          ? `${toAr(hc.day)} ${HIJRI_MONTHS_AR[hc.month - 1] ?? parts[1]}`
          : (HIJRI_MONTHS_AR[hc.month - 1] ?? parts[1]);
      } catch { label = parts[1]; }
    } else {
      const dt = new Date((isDay ? m.month : m.month + "-15") + "T12:00:00");
      label = isDay
        ? dt.toLocaleDateString("ar-SA", { day: "numeric", month: "long", calendar: "gregory" })
        : dt.toLocaleDateString("ar-SA", { month: "long", calendar: "gregory" });
    }
    const isEmpty = m.revenue === 0 && m.expenses === 0;
    const netCls = m.netProfit >= 0 ? "color:#16a34a;" : "color:#dc2626;";
    return `<tr>
      <td style="${tdBase}font-weight:600;">${label}</td>
      <td style="${tdBase}">${m.revenue > 0 ? formatAmount(m.revenue) : DASH}</td>
      <td style="${tdBase}">${m.expenses > 0 ? formatAmount(m.expenses) : DASH}</td>
      <td style="${tdBase}${isEmpty ? "" : netCls}">${isEmpty ? DASH : formatAmountSigned(m.netProfit)}</td>
    </tr>`;
  }).join("");

  const scriptTag = forPrint ? `<script>window.onload=function(){window.print();};<\/script>` : "";
  const qrHtml = qrDataUrl
    ? `<div class="qr-block"><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">مسح للتحقق</div></div>`
    : `<div class="qr-block" style="width:80px;"></div>`;
  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" style="height:68px;width:auto;object-fit:contain;display:block;" alt="تكية" />`
    : `<svg width="148" height="52" viewBox="0 0 148 52" xmlns="http://www.w3.org/2000/svg"><polygon points="10,27 26,11 42,27" fill="none" stroke="#8C6246" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><rect x="14" y="26" width="24" height="18" rx="2" fill="#8C6246" opacity="0.1" stroke="#8C6246" stroke-width="2"/><rect x="21" y="31" width="10" height="13" rx="1.5" fill="#8C6246" opacity="0.45"/><line x1="52" y1="10" x2="52" y2="43" stroke="#d9c9b8" stroke-width="1"/><text x="60" y="28" font-family="Segoe UI,Tahoma,Arial,sans-serif" font-size="21" font-weight="900" fill="#8C6246">تكية</text><text x="60" y="42" font-family="Segoe UI,Tahoma,Arial,sans-serif" font-size="9.5" fill="#a07852">منصة الشاليهات</text></svg>`;
  const chartSvg = buildMonthlyBarChartSvg(yearly.monthly, isCustom ? calMode : undefined);
  // The shared property finalizer owns compact versus detailed print layout.
  const currentPeriodNotice = isCurrentPeriod
    ? `<div class="current-period-notice">ملاحظة: هذا التقرير يعرض البيانات المالية المحققة حتى تاريخ اليوم ${printDate}.</div>`
    : "";
  const printMediaCss = ""; // Compact layout is scoped by finalizePropertyReportHtml.

  return finalizePropertyReportHtml(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
 <title>${fileName}</title>
<style>${REPORT_CSS}${printMediaCss}</style></head>
<body><div class="page print-container">

<div class="header">
<div class="header-brand">${logoHtml}</div>
<div class="header-center"><div class="report-title">التقرير المالي - ${escapeFinancialReportText(propertyName)}</div><div class="report-sub">${isCustom ? (isShortPeriod ? "تقرير حركة الفترة" : "التقرير المخصص") : "التقرير السنوي – " + toAr(year)}</div>${(() => { if (!isCustom) return ""; const parts = year.split(" ← "); const fromPart = parts[0]?.trim() ?? ""; const toPart = parts[1]?.trim() ?? ""; return parts.length === 2 ? `<div style="font-size:10.5px;color:#8C6246;font-weight:600;margin-top:5px;border:1px solid #e8e2d0;background:#faf9f6;border-radius:6px;padding:3px 10px;display:inline-block;">الفترة من: ${fromPart} إلى: ${toPart}</div>` : `<div style="font-size:10.5px;color:#555;margin-top:4px;">${year}</div>`; })()}<div class="report-sub" style="font-size:10px;color:#444;margin-top:4px;">تاريخ إصدار التقرير: ${printDate}</div></div>
${qrHtml}</div>
${currentPeriodNotice}

<div class="section"><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="width:4px;height:18px;background:#8C6246;border-radius:2px;flex-shrink:0;display:inline-block;"></span><span style="font-size:14px;font-weight:700;color:#8C6246;margin:0;line-height:1;">${isCustom ? "الملخص المالي" : "الملخص المالي السنوي"}</span></div>
<div style="display:flex;gap:12px;margin-bottom:20px;">
  <div class="kpi-card kpi-green" style="flex:1;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;height:100px!important;padding:8px!important;text-align:center!important;"><div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-4px);"><div class="kpi-label" style="margin:0;padding:0;font-size:11px;color:#333;font-weight:600;line-height:1.3;">${isCustom ? "إجمالي الإيرادات" : "إجمالي الإيرادات السنوية"}</div><div class="kpi-value" style="margin:0;padding:0;font-size:17px;color:#111;font-weight:700;line-height:1.2;">${yearly.totals.revenue.toLocaleString("ar-SA")} ر.س</div><div class="kpi-note" style="margin:0;padding:0;font-size:10px;color:#555;font-weight:500;line-height:1.3;">${isCustom ? "إجمالي الإيرادات" : "مجموع الإيرادات السنوية"}</div></div></div>
  <div class="kpi-card kpi-red" style="flex:1;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;height:100px!important;padding:8px!important;text-align:center!important;"><div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-4px);"><div class="kpi-label" style="margin:0;padding:0;font-size:11px;color:#333;font-weight:600;line-height:1.3;">${isCustom ? "إجمالي المصروفات" : "إجمالي المصروفات السنوية"}</div><div class="kpi-value" style="margin:0;padding:0;font-size:17px;color:#111;font-weight:700;line-height:1.2;">${yearly.totals.expenses.toLocaleString("ar-SA")} ر.س</div><div class="kpi-note" style="margin:0;padding:0;font-size:10px;color:#555;font-weight:500;line-height:1.3;">${isCustom ? "إجمالي المصروفات" : "مجموع المصروفات السنوية"}</div></div></div>
  <div class="kpi-card ${yearly.totals.netProfit >= 0 ? "kpi-green" : "kpi-red"}" style="flex:1;display:flex!important;flex-direction:column!important;justify-content:center!important;align-items:center!important;height:100px!important;padding:8px!important;text-align:center!important;"><div style="display:flex;flex-direction:column;align-items:center;gap:2px;transform:translateY(-4px);"><div class="kpi-label" style="margin:0;padding:0;font-size:11px;color:#333;font-weight:600;line-height:1.3;">${isCustom ? "صافي الربح" : "صافي الربح السنوي"}</div><div class="kpi-value" style="margin:0;padding:0;font-size:17px;font-weight:700;line-height:1.2;color:${yearly.totals.netProfit >= 0 ? "#16a34a" : "#dc2626"};">${yearly.totals.netProfit.toLocaleString("ar-SA")} ر.س</div><div class="kpi-note" style="margin:0;padding:0;font-size:10px;color:#555;font-weight:500;line-height:1.3;">الإيرادات - المصروفات</div></div></div>
</div></div>

${chartSvg ? `<div class="section"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;"><span style="width:4px;height:18px;background:#8C6246;border-radius:2px;flex-shrink:0;display:inline-block;"></span><span style="font-size:14px;font-weight:700;color:#8C6246;margin:0;line-height:1;">${isCustom ? "أداء الإيرادات والمصروفات" : "أداء الإيرادات والمصروفات السنوية"}</span></div><div style="text-align:left;margin-bottom:10px;direction:rtl;"><span style="display:inline-block;margin-left:16px;font-size:11px;color:#333;font-weight:600;"><span style="width:11px;height:11px;background:#16a34a;border-radius:2px;display:inline-block;margin-left:5px;vertical-align:middle;"></span><span style="vertical-align:middle;">إيرادات</span></span><span style="display:inline-block;font-size:11px;color:#333;font-weight:600;"><span style="width:11px;height:11px;background:#dc2626;border-radius:2px;display:inline-block;margin-left:5px;vertical-align:middle;"></span><span style="vertical-align:middle;">مصروفات</span></span></div><div style="padding-bottom:10px;">${chartSvg}</div></div>` : ""}

${showDetails ? `<div class="section-auto"><div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><span style="width:4px;height:18px;background:#8C6246;border-radius:2px;flex-shrink:0;display:inline-block;"></span><span style="font-size:14px;font-weight:700;color:#8C6246;margin:0;line-height:1;">تفاصيل الإيرادات والمصروفات</span></div>
<table><thead><tr>
<th style="height:38px;padding:10px 8px 4px;text-align:right;direction:rtl;vertical-align:top;">الشهر</th><th style="height:38px;padding:10px 8px 4px;text-align:right;direction:rtl;vertical-align:top;">الإيرادات (ر.س)</th><th style="height:38px;padding:10px 8px 4px;text-align:right;direction:rtl;vertical-align:top;">المصروفات (ر.س)</th><th style="height:38px;padding:10px 8px 4px;text-align:right;direction:rtl;vertical-align:top;">صافي الربح (ر.س)</th>
</tr></thead>
<tbody>${rows}<tr class="total-row">
<td style="height:38px;padding:10px 8px 4px;vertical-align:top;text-align:right;direction:rtl;font-weight:700;">${isCustom ? "الإجمالي" : "الإجمالي السنوي"}</td>
<td style="height:38px;padding:10px 8px 4px;vertical-align:top;text-align:right;direction:rtl;font-weight:700;">${formatAmount(yearly.totals.revenue)}</td>
<td style="height:38px;padding:10px 8px 4px;vertical-align:top;text-align:right;direction:rtl;font-weight:700;">${formatAmount(yearly.totals.expenses)}</td>
<td style="height:38px;padding:10px 8px 4px;vertical-align:top;text-align:right;direction:rtl;font-weight:700;${yearly.totals.netProfit >= 0 ? "color:#16a34a" : "color:#dc2626"}">${formatAmountSigned(yearly.totals.netProfit)}</td>
</tr></tbody>
</table></div>` : ""}
${buildPropertyReportClosingHtml(yearly.totals)}

<div class="footer">منصة تكيّة — تقرير مالي</div>
</div>${scriptTag}</body></html>`, showDetails);
}

/* ── Fresh PDF from the currently visible service receipt DOM ── */
export async function createFreshReceiptPdfBlobFromDom(
  receiptElement: HTMLElement,
  fileName: string,
): Promise<{ blob: Blob; fileName: string }> {
  await document.fonts?.ready;

  const receiptImages = Array.from(receiptElement.querySelectorAll("img"));
  await Promise.all(
    receiptImages.map((image) => image.complete
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          image.addEventListener("load", () => resolve(), { once: true });
          image.addEventListener("error", () => resolve(), { once: true });
          window.setTimeout(resolve, 2500);
        })),
  );

  const canvas = await html2canvas(receiptElement, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    windowWidth: window.innerWidth,
    scrollX: 0,
    scrollY: -window.scrollY,
    logging: false,
  });

  const A4_W_MM = 210;
  const A4_H_MM = 297;
  const MARGIN_MM = 18;
  const availableWidthMm = A4_W_MM - MARGIN_MM * 2;
  const availableHeightMm = A4_H_MM - MARGIN_MM * 2;
  const naturalHeightMm = canvas.height * (availableWidthMm / canvas.width);
  const scaleFactor = Math.min(1, availableHeightMm / naturalHeightMm);
  const renderWidthMm = availableWidthMm * scaleFactor;
  const renderHeightMm = naturalHeightMm * scaleFactor;
  const offsetX = (A4_W_MM - renderWidthMm) / 2;
  const offsetY = MARGIN_MM;

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, A4_W_MM, A4_H_MM, "F");
  pdf.addImage(
    canvas.toDataURL("image/jpeg", 0.96),
    "JPEG",
    offsetX,
    offsetY,
    renderWidthMm,
    renderHeightMm,
  );

  const pdfArrayBuffer = pdf.output("arraybuffer");
  return {
    blob: new Blob([pdfArrayBuffer], { type: "application/pdf" }),
    fileName,
  };
}

/* ── HTML → PDF blob (html2canvas + jsPDF) ── */
export async function htmlToPdfBlob(html: string, fileName: string): Promise<{ blob: Blob; fileName: string }> {
  const CONTENT_PX = 750; // must match .page width in REPORT_CSS

  // Render inside a hidden iframe — completely isolated from the main document.
  // An iframe creates its own rendering context: no layout shifts, no scroll jumps,
  // no viewport/paint disruption on the live dashboard screen.
  // top:-9999px (fixed) puts it above the viewport; the main page is never repainted.
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = [
    "position:fixed",
    "top:-9999px",
    "left:0",
    `width:${CONTENT_PX}px`,
    "height:5000px",
    "border:none",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(iframe);

  try {
    const iDoc = iframe.contentDocument!;
    iDoc.open();
    iDoc.write(html);
    iDoc.close();

    // Wait for iframe load + fonts/CSS to render
    await new Promise<void>(resolve => {
      if (iDoc.readyState === "complete") resolve();
      else iframe.onload = () => resolve();
    });
    await iDoc.fonts.ready;
    await Promise.all(Array.from(iDoc.images).map(image => image.decode().catch(() => undefined)));
    await new Promise<void>(resolve => setTimeout(resolve, 150));

    const pageEl = iDoc.querySelector<HTMLElement>(".page") ?? iDoc.body;
    // Keep Arabic shaping in the browser rather than reconstructing letters in PDF text.
    pageEl.style.fontKerning = "normal";
    pageEl.style.letterSpacing = "normal";

    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      width: CONTENT_PX,
      windowWidth: CONTENT_PX,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });

    // Match the native financial print margins: 8mm vertically, 10mm horizontally.
    // canvas is rendered at scale:2, so canvas.width = CONTENT_PX × 2.
    // Mapping: contentWidthMm / canvas.width  →  mm per canvas-pixel.
    const A4_W_MM = 210;
    const A4_H_MM = 297;
    const margins = FINANCIAL_REPORT_MARGINS_MM;
    const contentWidthMm = A4_W_MM - margins.left - margins.right;
    const contentHeightPerPageMm = A4_H_MM - margins.top - margins.bottom;
    const mmPerCanvasPx = contentWidthMm / canvas.width;
    const pageHeightCanvasPx = Math.floor(contentHeightPerPageMm / mmPerCanvasPx);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    if (!iDoc.body.classList.contains("property-report-compact") && canvas.height > pageHeightCanvasPx) {
      const pageRect = pageEl.getBoundingClientRect();
      const pixelRatio = canvas.height / pageRect.height;
      const measure = (element: Element) => {
        const rect = element.getBoundingClientRect();
        return { top: Math.floor((rect.top - pageRect.top) * pixelRatio),
          bottom: Math.ceil((rect.bottom - pageRect.top) * pixelRatio) };
      };
      const boundaries = Array.from(pageEl.querySelectorAll(".header,.section,.section-auto,.financial-sales-details,.footer,tr"))
        .flatMap(element => { const block = measure(element); return [block.top, block.bottom]; });
      const protectedBlocks = Array.from(pageEl.querySelectorAll(".header,.section,.financial-closing,table,tr,.kpi-card,.financial-summary-table,.financial-report-scope"))
        .map(measure);
      // A section title stays with its first table row, not alone at a page foot.
      for (const section of pageEl.querySelectorAll(".section,.section-auto,.financial-sales-details")) {
        const heading = section.querySelector(".section-title,h2,h3") ?? section.firstElementChild;
        const firstRow = section.querySelector("tbody tr");
        if (heading && firstRow) protectedBlocks.push({ top: measure(heading).top, bottom: measure(firstRow).bottom });
      }
      const header = pageEl.querySelector(".header");
      const headerBottom = header ? measure(header).bottom : 0;
      const tables = Array.from(pageEl.querySelectorAll("table")).flatMap(table => {
        const head = table.querySelector("thead");
        return head ? [{ ...measure(table), headerTop: measure(head).top, headerBottom: measure(head).bottom }] : [];
      });
      const ranges = financialReportPageSlices(canvas.height, pageHeightCanvasPx, boundaries, protectedBlocks, headerBottom, tables);
      ranges.forEach(({ start, end, repeatHeader, tableHeader }, index) => {
        if (index) pdf.addPage();
        const headerSpace = repeatHeader ? headerBottom + 16 : 0;
        const tableSpace = tableHeader ? tableHeader.bottom - tableHeader.top + 12 : 0;
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = headerSpace + tableSpace + end - start;
        const context = slice.getContext("2d");
        if (!context) throw new Error("تعذّر تجهيز صفحات التقرير التفصيلي");
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, slice.width, slice.height);
        if (repeatHeader) context.drawImage(canvas, 0, 0, canvas.width, headerBottom, 0, 0, canvas.width, headerBottom);
        if (tableHeader) context.drawImage(canvas, 0, tableHeader.top, canvas.width, tableHeader.bottom - tableHeader.top,
          0, headerSpace, canvas.width, tableHeader.bottom - tableHeader.top);
        context.drawImage(canvas, 0, start, canvas.width, end - start, 0, headerSpace + tableSpace, canvas.width, end - start);
        pdf.addImage(slice.toDataURL("image/jpeg", 0.93), "JPEG", margins.left, margins.top,
          contentWidthMm, slice.height * mmPerCanvasPx);
      });
    } else {
    // Compact reports keep their whole summary and closing accounts on one page.
    // If content height ≤ one page → render at natural size.
    // If content overflows → scale down uniformly so everything fits on page 1.
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, A4_W_MM, A4_H_MM, "F");

    const contentHeightMm = canvas.height * mmPerCanvasPx;
    const scaleFactor = Math.min(1, contentHeightPerPageMm / contentHeightMm);
    const renderW = contentWidthMm * scaleFactor;
    const renderH = contentHeightMm * scaleFactor;
    // Center horizontally if scaled down
    const offsetX = margins.left + (contentWidthMm - renderW) / 2;
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.93), "JPEG", offsetX, margins.top, renderW, renderH);
    }

    // إخراج الـ PDF كـ ArrayBuffer نقي ثم بناء Blob بترميز صريح
    // يمنع أي تلاعب في الترميز أثناء نقل الملف عبر Web Share API
    const pdfArrayBuffer = pdf.output("arraybuffer");
    const cleanBlob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
    return { blob: cleanBlob, fileName };
  } finally {
    if (document.body.contains(iframe)) document.body.removeChild(iframe);
  }
}

/* ── Generate PDF → upload to storage → return public URL ── */
export async function generateAndUploadReportPdf(
  type: "monthly" | "yearly",
  params: {
    month?: string;
    hijriMonth?: string;
    year?: string;
    hijriYear?: string;
    propertyName: string;
    report?: MonthReport | null;
    financial?: { totalRevenue: number; totalInsuranceHeld?: number; totalInsuranceDeducted?: number; totalExpenses: number; netProfit: number; categoryTotals: Record<string, number> } | null;
    yearly?: { monthly: { month: string; revenue: number; expenses: number; netProfit: number }[]; totals: { revenue: number; expenses: number; netProfit: number } } | null;
    breakdown?: ReportBreakdown;
    monthTitle?: string | null;
    calMode?: ReportCalendarMode;
    fileName?: string;
    showDetails?: boolean;
  }
): Promise<string | null> {
  let html: string;
  const calMode = params.calMode ?? "gregorian";
  const fileName = params.fileName ?? buildReportFileName({
    viewMode: type,
    calMode,
    month: params.month,
    hijriMonth: params.hijriMonth,
    year: params.year,
    hijriYear: params.hijriYear,
  });

  if (type === "monthly") {
    const qr = await generateReportQrDataUrl("monthly", params.month!);
    const logo = await getLogoDataUrl();
    html = buildMonthlyReportHtml(params.month!, params.propertyName, params.report, params.financial, false, qr, params.breakdown ?? null, params.monthTitle ?? null, logo, false, fileName, params.showDetails);
  } else {
    const qr = await generateReportQrDataUrl("yearly", params.year!);
    const logo = await getLogoDataUrl();
    html = buildYearlyReportHtml(params.year!, params.propertyName, params.yearly!, false, qr, logo, false, calMode, false, undefined, false, fileName, params.showDetails);
  }

  const { blob } = await htmlToPdfBlob(html, fileName);
  const file = new File([blob], fileName, { type: "application/pdf" });
  return uploadFile(file);
}
