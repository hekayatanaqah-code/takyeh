import type { ArchiveCell, ArchiveExportTable } from "./bookingArchiveExport";
import { buildArchivePdfPage } from "./bookingArchivePdf";
import type { ArchiveReportContext } from "./bookingArchiveReport";

export function archivePdfColumnGroups(table: ArchiveExportTable): { title: string; columns: number[] }[] {
  const client = table.headers.findIndex(header => header === "اسم العميل");
  const keys = [0, ...(client > 0 ? [client] : [])];
  const money = table.numericColumns;
  const identity = table.headers.map((_, index) => index).filter(index => !money.includes(index) && !keys.includes(index));
  const groups: { title: string; columns: number[] }[] = [];
  for (let index = 0; index < identity.length; index += 5) {
    groups.push({ title: money.length ? "بيانات الحجز" : "تفاصيل إعادة الجدولة", columns: [...keys, ...identity.slice(index, index + 5)] });
  }
  for (let index = 0; index < money.length; index += 4) {
    groups.push({ title: `البيانات المالية${money.length > 4 ? ` — القسم ${Math.floor(index / 4) + 1}` : ""}`, columns: [...keys, ...money.slice(index, index + 4)] });
  }
  return groups.length ? groups : [{ title: "بيانات الحجز", columns: keys }];
}

async function imageDataUrl(source: string): Promise<string> {
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source)) return source;
  const url = new URL(source, window.location.href);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("رابط شعار التقرير غير صالح.");
  const response = await fetch(url, { credentials: url.origin === window.location.origin ? "include" : "omit" });
  if (!response.ok) throw new Error("تعذّر تحميل شعار التقرير. تحقق من الاتصال ثم أعد المحاولة.");
  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) throw new Error("ملف الشعار ليس صورة صالحة.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("تعذّرت قراءة صورة الشعار."));
    reader.readAsDataURL(blob);
  });
}

/** Kept separate from saving so a generated PDF can also be inspected or reused. */
export async function createArchivePdf(table: ArchiveExportTable, context: ArchiveReportContext) {
  const [{ default: html2canvas }, { jsPDF }, platformLogoUrl, ownerLogoUrl, propertyLogos] = await Promise.all([
    import("html2canvas"), import("jspdf"), imageDataUrl(context.platformLogoUrl),
    context.ownerLogoUrl ? imageDataUrl(context.ownerLogoUrl) : Promise.resolve(null),
    Promise.all((context.propertyLogos ?? []).map(async logo => ({ ...logo, url: await imageDataUrl(logo.url) }))),
  ]);
  const branded = { ...context, platformLogoUrl, ownerLogoUrl, propertyLogos };
  const previousScroll = { left: window.scrollX, top: window.scrollY };
  const host = document.createElement("div");
  // A negative off-screen X position expands RTL scroll bounds and can displace the live dashboard.
  host.style.cssText = "position:fixed;top:0;left:0;width:1200px;z-index:-10000;background:white;pointer-events:none";
  host.dir = "rtl";
  document.body.appendChild(host);
  const maxHeight = 805;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  type Page = { columns: number[]; title: string; rows: ArchiveCell[][]; summary: boolean };
  const pages: Page[] = [];
  const render = async (page: Page, pageNumber = 1, totalPages = 1) => {
    host.innerHTML = buildArchivePdfPage({ table, context: branded, rows: page.rows, columns: page.columns,
      sectionTitle: page.title, includeSummary: page.summary, pageNumber, totalPages });
    await document.fonts.ready;
    await Promise.all(Array.from(host.querySelectorAll("img")).map(image => image.decode()));
    const element = host.firstElementChild as HTMLElement;
    element.style.minHeight = `${maxHeight}px`;
    element.style.display = "flex";
    element.style.flexDirection = "column";
    Array.from(element.children).forEach(child => { (child as HTMLElement).style.flexShrink = "0"; });
    const footer = element.querySelector<HTMLElement>(".ap-foot");
    if (footer) footer.style.marginTop = "auto";
    return element;
  };
  try {
    for (const group of archivePdfColumnGroups(table)) {
      const monetary = group.columns.some(column => table.numericColumns.includes(column));
      let page: Page = { ...group, rows: [], summary: false };
      for (const row of table.rows) {
        const trial = { ...page, rows: [...page.rows, row] };
        const element = await render(trial);
        if (element.scrollHeight > maxHeight && page.rows.length) {
          pages.push(page);
          page = { ...group, rows: [row], summary: false };
        } else {
          page = trial;
        }
        // Fail explicitly instead of shrinking the entire page to unreadable text or clipping it.
        const current = await render(page);
        if (current.scrollHeight > maxHeight || current.scrollWidth > 1201) {
          throw new Error("أحد السجلات أو عناوين التقرير طويل جداً للطباعة بخط مقروء. استخدم Excel لهذا النطاق أو ضيّق الفلاتر.");
        }
      }
      if (monetary) {
        const withSummary = { ...page, summary: true };
        const element = await render(withSummary);
        if (element.scrollHeight <= maxHeight) {
          page = withSummary;
        } else {
          pages.push(page);
          page = { ...group, rows: [], summary: true };
          if ((await render(page)).scrollHeight > maxHeight) throw new Error("ترويسة التقرير طويلة جداً للطباعة. استخدم نطاقاً أقل في التقرير.");
        }
      }
      pages.push(page);
    }
    for (let index = 0; index < pages.length; index++) {
      const element = await render(pages[index], index + 1, pages.length);
      const canvas = await html2canvas(element, { scale: 1.75, backgroundColor: "#ffffff", logging: false, windowWidth: 1280 });
      if (index) pdf.addPage();
      // Constant width and font size across all pages; never scale down a dense page.
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 10, 10, 277, canvas.height * 277 / canvas.width);
      canvas.width = canvas.height = 0;
    }
    return pdf;
  } finally {
    host.remove();
    window.scrollTo({ ...previousScroll, behavior: "instant" });
  }
}
