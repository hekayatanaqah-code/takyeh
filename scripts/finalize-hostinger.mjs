import {readFile,readdir,writeFile,cp} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const output=path.join(root,"generated-artifacts/hostinger"),release=path.join(output,"takyeh-hostinger");
const smoke=JSON.parse(await readFile(path.join(release,"reports/package-smoke.json"),"utf8"));
const audit=JSON.parse(await readFile(path.join(root,".local/hostinger-reports/runtime-audit.json"),"utf8"));
if(!smoke.passed||!audit.staticAuditPassed)throw new Error("Release verification is incomplete.");
await cp(path.join(root,".local/hostinger-reports/review.html"),path.join(release,"reports/source-review.html"));
await cp(path.join(root,"docs/hostinger-install-ar.md"),path.join(release,"اقرأني.md"));
const html=`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اعتماد حزمة تكيّة — Hostinger</title>
<style>body{font:17px/1.9 system-ui;background:#f4f2ee;color:#24303b;margin:0;padding:24px}main{max-width:900px;margin:auto;background:white;padding:30px;border-radius:16px}h1{color:#795133}li{margin:8px 0}.pass{padding:16px;background:#edf7ef;border:1px solid #a3c9ab;border-radius:8px}.notice{padding:16px;background:#fff2db;border:1px solid #d5b578;border-radius:8px}code{direction:ltr;unicode-bidi:isolate}small{font-size:15px}</style><main>
<h1>تقرير فحص حزمة تكيّة</h1><p><small>${smoke.checkedAt}</small></p>
<p class="pass"><strong>اجتازت الحزمة اختبار تشغيل مستقل محلياً على MariaDB 10.11، وهي مجهزة للتثبيت على استضافة Node.js.</strong></p>
<h2>ما تم التحقق منه فعلياً</h2><ul>
<li>تشغيل ملف الإنتاج المبني نفسه، دون قاعدة PostgreSQL أو خدمات تخزين Replit، مع فحص الهيكل والأقفال.</li>
<li>تقديم الواجهة والإعدادات وAPI من خدمة Express واحدة، وحجب الملفات الخاصة والمسارات غير الصحيحة.</li>
<li>استيراد الإعدادات وحساب المدير فقط؛ بقيت الحجوزات وطلبات الخدمات والبيع السريع فارغة.</li>
<li>دخول مدير تجريبي في قاعدة مؤقتة معزولة، واستمرار الجلسة وفتح الملخص المالي للإدارة.</li>
<li>رفع ملف برابط موقّع وقراءة بايتاته الصحيحة، وحجب الملف عند جعله خاصاً.</li>
<li>تحويل صورة إلى WebP عبر sharp، وظهورها بعد إعادة تشغيل العملية.</li>
<li>نسخ ملفات الهوية المرتبطة بالإعدادات إلى التخزين المحلي، والتحقق من ظهورها من الحزمة.</li>
<li>توافر ملف ffmpeg التنفيذي داخل الاعتمادات المستقلة، دون الاعتماد على مسار Nix.</li>
</ul><h2>ما لم يُعتمد بعد</h2><p class="notice">لم تُرفع الحزمة إلى Hostinger ولم يُربط النطاق. لا يثبت هذا الاختبار صلاحيات حساب قاعدة Hostinger أو إعداد HTTPS أو تسليم البريد أو دفعاً حقيقياً. خادم الاختبار محلي ومؤقت باتصال Unix socket دون اختبار صلاحيات مستخدم الاستضافة.</p>
<p>حساب المدير الحقيقي وكلمة مروره لم يُستخدما في تسجيل الدخول التجريبي ولم يتغيرا في قاعدة المصدر؛ استُخدمت كلمة مؤقتة داخل قاعدة الاختبار وحدها ثم حُذفت القاعدة.</p>
<h2>قبل التفعيل</h2><ol><li>اتبع ملف اقرأني واستورد ملفات القاعدة في قاعدة جديدة فارغة.</li><li>ضع الملفات الدائمة خارج جذر الويب ومجلد الإصدار، واضبط البيئة والمفاتيح السرية على الاستضافة.</li><li>افحص رابط الاستضافة ونسخ القاعدة والملفات الاحتياطية، ثم فعّل النطاق وHTTPS.</li></ol>
<p><strong>تنبيه خصوصية:</strong> ملف seed.sql يحتوي تجزئة كلمة مرور المدير وإعدادات التواصل. لا تنشر مجلد database أو الحزمة كاملة في مسار عام.</p>
</main></html>`;
await writeFile(path.join(release,"reports/جاهزية-الحزمة.html"),html);
const manifest=JSON.parse(await readFile(path.join(release,"manifest.json"),"utf8"));
const files=[];
async function walk(directory){
 for(const item of await readdir(directory,{withFileTypes:true})){
  if(item.name==="node_modules")continue;
  const filename=path.join(directory,item.name),relative=path.relative(release,filename);
  if(relative==="manifest.json")continue;
  if(item.isSymbolicLink())throw new Error("Unexpected release symlink.");
  if(item.isDirectory())await walk(filename);
  else{if(item.name===".env")throw new Error("Live environment file in release.");const bytes=await readFile(filename);
   files.push({path:relative,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});}
 }
}
await walk(release);
await writeFile(path.join(release,"manifest.json"),JSON.stringify({...manifest,createdAt:new Date().toISOString(),
 productionBundleSmokePassed:true,hostingerLiveVerified:false,files},null,2));
const archive=path.join(output,"takyeh-hostinger-mariadb-local-storage.zip");
execFileSync("zip",["-q","-r","-FS",archive,"takyeh-hostinger","-x","*/node_modules/*"],{cwd:output});
const bytes=await readFile(archive),sha256=createHash("sha256").update(bytes).digest("hex");
await writeFile(archive+".sha256",`${sha256}  ${path.basename(archive)}\n`);
console.log(JSON.stringify({archive:path.relative(root,archive),size:bytes.length,sha256,verifiedFiles:files.length}));
