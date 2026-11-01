/* Home navigation only. Never cache private pages, API responses, or financial data. */
const OFFLINE_HOME = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#54204f"><title>تكية — لا يوجد اتصال</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#faf9f7;color:#282228;font:18px/1.8 system-ui,sans-serif}main{max-width:32rem;padding:32px;text-align:center}h1{color:#54204f;font-size:36px}a{display:inline-block;padding:12px 24px;border-radius:12px;background:#54204f;color:white;text-decoration:none}</style>
</head><body><main><h1>تكية</h1><h2>أنت غير متصل بالإنترنت</h2>
<p>تحتاج الصفحة الرئيسية إلى اتصال بالإنترنت لعرض المعلومات المحدثة. تأكد من اتصالك ثم أعد المحاولة.</p>
<a href="./">إعادة المحاولة</a></main></body></html>`;

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  const home = new URL(self.registration.scope);
  if (request.method !== "GET" || request.mode !== "navigate" ||
      url.origin !== home.origin || url.pathname !== home.pathname) return;

  event.respondWith(fetch(request).catch(() => new Response(OFFLINE_HOME, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })));
});
