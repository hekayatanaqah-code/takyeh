import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditSource, type Finding } from "./mariadb/runtime-audit";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function sourceFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (["fixtures", "maintenance", "dist", "node_modules"].includes(item.name)) continue;
    const location = path.join(directory, item.name);
    if (item.isDirectory()) files.push(...await sourceFiles(location));
    else if (/\.tsx?$/.test(item.name) && !/\.(?:test|spec)\./.test(item.name)) files.push(location);
  }
  return files;
}

async function main() {
  const files = [
    ...await sourceFiles(path.join(root, "artifacts/api-server/src")),
    ...await sourceFiles(path.join(root, "lib/db/src")),
  ].sort();
  const findings: Finding[] = [];
  for (const file of files) {
    findings.push(...auditSource(path.relative(root, file), await readFile(file, "utf8")));
  }
  const groups: Record<string, number> = {};
  for (const finding of findings) groups[finding.rule] = (groups[finding.rule] ?? 0) + 1;
  const blocking = findings.filter(item => item.severity === "blocker");
  const directory = path.join(root, ".local/hostinger-reports");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const report = {
    generatedAt: new Date().toISOString(),
    releaseReady: false,
    staticAuditPassed: blocking.length === 0,
    nativeCriticalFlowsVerified: false,
    storageMigrationVerified: false,
    hostingerDeploymentVerified: false,
    scannedSourceFiles: files.length,
    affectedFiles: new Set(findings.map(item => item.file)).size,
    blockingFindings: blocking.length,
    reviewFindings: findings.length - blocking.length,
    groups,
    findings,
    limitations: [
      "Structural inventory, not SQL semantic validation or automatic conversion.",
      "Fixtures, maintenance scripts and tests are excluded; audit separately before use.",
      "A passing static scan does not certify login, finance, concurrency, storage or deployment.",
    ],
  };
  await writeFile(path.join(directory, "runtime-audit.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  const lines = [
    "# مراجعة جاهزية MariaDB وHostinger",
    "",
    "**النتيجة: غير جاهز للإطلاق. هذا تقرير مراجعة وليس حزمة تشغيل نهائية.**",
    "",
    `تم فحص ${files.length} ملف مصدر. توجد ${blocking.length} ملاحظة مانعة و${findings.length - blocking.length} موضعاً يحتاج مراجعة لهيئة النتائج.`,
    "",
    "## التصنيف",
    "",
    "| التصنيف | المواضع |", "|---|---:|",
    ...Object.entries(groups).sort().map(([rule, count]) => `| ${rule} | ${count} |`),
    "",
    "## المواقع",
    "",
    "| الملف | السطر | الملاحظة |", "|---|---:|---|",
    ...findings.map(item => `| ${item.file} | ${item.line} | ${item.rule} |`),
    "",
    "الفحص بنيوي للشيفرة وليس إثباتاً لصحة SQL أو المعاملات. لم يتم نقل بيانات أو تغيير قاعدة التطوير.",
    "لا يتضمن محتوى الإعدادات أو كلمات المرور. يلزم تحويل المستهلكين واختبارهم فعلياً على MariaDB قبل إصدار الحزمة.",
  ];
  await writeFile(path.join(directory, "runtime-audit.md"), lines.join("\n") + "\n", { mode: 0o600 });
  const escape = (value: string) => value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
  const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مراجعة نقل تكيّة إلى MariaDB</title>
<style>
body{font:16px/1.8 system-ui,sans-serif;color:#202b36;background:#f4f3f0;margin:0;padding:24px}
main{max-width:1050px;margin:auto;background:white;padding:28px;border-radius:12px}
h1,h2{line-height:1.5} .status{background:#fff1e4;color:#773600;border:1px solid #e9be99;padding:16px;border-radius:8px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{padding:9px;border:1px solid #d6dade;text-align:right}
th{background:#f0f2f3}code,.path{direction:ltr;unicode-bidi:isolate;overflow-wrap:anywhere}
small{font-size:14px} @media print{body,main{padding:0;background:white}thead{display:table-header-group}tr,h2{break-inside:avoid}h2{break-after:avoid}}
</style><main>
<h1>مراجعة نقل تكيّة إلى MariaDB وHostinger</h1>
<p><small>تاريخ إنشاء التقرير: <bdi>${escape(report.generatedAt)}</bdi></small></p>
<div class="status"><strong>التحويل الشامل غير مكتمل — لا توجد حزمة نهائية معتمدة للرفع.</strong>
<p>الخادم الحالي ما زال PostgreSQL. لم يتم تحويل جميع الاستعلامات أو ربط المسارات المالية بطبقة MariaDB الجديدة، ولم يتم نشر شيء أو تعديل قاعدة المنصة.</p></div>
<h2>نطاق الفحص</h2><p>فُحص ${files.length} ملف مصدر، وتوجد ملاحظات في ${report.affectedFiles} ملفاً:
${blocking.length} موضعاً مانعاً و${report.reviewFindings} موضعاً يحتاج مراجعة لهيئة النتائج.
هذه أعداد مواضع في الشيفرة، وليست أعداد أعطال ظهرت للمستخدمين.</p>
<h2>ما تم تجهيزه</h2><ul>
<li>طبقة معاملات MariaDB أصلية مع أقفال صفوف InnoDB داخل المعاملة نفسها، دون GET_LOCK أو إعادة محاولة تلقائية للمدفوعات. ليست موصولة بعد بمسارات المنصة الحالية.</li>
<li>نقطة تشغيل Express مخصصة للاستضافة، مع تقديم الواجهة وAPI من خدمة واحدة عند اكتمال التحويل. ترفض حالياً تشغيل الخادم القديم باعتباره MariaDB.</li>
<li>حماية الملفات المخفية، وعدم تحويل أخطاء API والأصول المفقودة إلى صفحة HTML.</li>
<li>فحص يمنع بناء نسخة Hostinger عند اكتشاف الاعتمادات القديمة.</li>
</ul>
<h2>التحقق المنفذ</h2><ul>
<li>اختبارات طبقة المعاملات على MariaDB 10.11 محلي مستقل: منع صرف الرصيد مرتين، منع تجاوز سعة واحدة، التراجع، تحرر الأقفال، واستقلال موارد مختلفة.</li>
<li>اختبار فشل COMMIT ذي النتيجة المجهولة: لا إعادة تنفيذ تلقائية، ولا إعادة الاتصال المتضرر للمسبح.</li>
<li>اختبارات إعدادات تشغيل Hostinger ومسارات الواجهة والأصول وAPI وحجب الملفات الخاصة.</li>
</ul><p><strong>ليست هذه اختبارات اعتماد لرحلات الدخول والحجز والدفع والتقارير بعد تحويلها. تلك الرحلات لم تُنقل بالكامل بعد.</strong></p>
<h2>تصنيف الاعتمادات المكتشفة</h2><table><thead><tr><th>الاعتماد التقني</th><th>المواضع</th></tr></thead><tbody>
${Object.entries(groups).sort().map(([rule, count]) => `<tr><td><code>${escape(rule)}</code></td><td>${count}</td></tr>`).join("")}
</tbody></table>
<h2>متطلبات اعتماد الحزمة النهائية</h2><ol>
<li>نقل جميع مستهلكي قاعدة البيانات إلى التعريفات الأصلية، وتحويل نتائج الحفظ والتعارضات وSQL والمصفوفات وJSON ورموز الأخطاء.</li>
<li>توصيل جميع كتّاب الأرصدة والسعة والاستردادات والأرقام التراكمية بأقفال متسقة واختبارها بالتزامن.</li>
<li>فصل تخزين الملفات عن خدمة Replit الداخلية ونقل الوسائط الخاصة والعامة بصلاحياتها.</li>
<li>اختبار الدخول والدفع والإلغاء والاسترداد والتقارير على MariaDB، ثم اختبار الاستضافة قبل ربط النطاق.</li>
</ol><p>تم الحفاظ على نطاق النقل السابق: الإعدادات وحساب المدير فقط. لا يحتوي التقرير بيانات حسابات أو كلمات مرور أو تجزئاتها.</p>
<details><summary>قائمة مواقع المراجعة الكاملة</summary><table><thead><tr><th>الملف</th><th>السطر</th><th>الملاحظة</th></tr></thead><tbody>
${findings.map(item => `<tr><td class="path">${escape(item.file)}</td><td>${item.line}</td><td><code>${escape(item.rule)}</code></td></tr>`).join("")}
</tbody></table></details>
<h2>حدود التقرير</h2><p>هذا جرد بنيوي للشيفرة، وليس مترجماً آلياً أو إثباتاً لصحة SQL.
تُستثنى ملفات الاختبار والتجهيزات وأوامر الصيانة. نجاح فحص المصدر وحده لا يعتمد المعاملات أو النشر.
الحزمة السابقة تخص هيكل القاعدة وSeed فقط، وليست نسخة تطبيق كاملة.</p></main></html>`;
  await writeFile(path.join(directory, "review.html"), html, { mode: 0o600 });
  console.log(JSON.stringify({
    staticAuditPassed: report.staticAuditPassed,
    scannedSourceFiles: files.length,
    affectedFiles: report.affectedFiles,
    blockingFindings: blocking.length,
    reviewFindings: report.reviewFindings,
    groups,
    report: ".local/hostinger-reports/runtime-audit.md",
  }, null, 2));
  // A clean scan only clears the source gate. releaseReady remains false:
  // operational verification must not be inferred from absence of patterns.
  process.exitCode = blocking.length > 0 ? 1 : 0;
}

main().catch(() => {
  console.error("Hostinger audit failed; no package was created.");
  process.exitCode = 1;
});
