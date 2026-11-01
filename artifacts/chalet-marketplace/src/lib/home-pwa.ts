/** Install support starts at home only; no private-page caching or recovery reloads. */
export async function registerHomePwa() {
  if (!window.isSecureContext || !("serviceWorker" in navigator)) return;
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  base.pathname = `${base.pathname.replace(/\/$/, "")}/`;
  if (window.location.pathname !== base.pathname &&
      window.location.pathname !== base.pathname.replace(/\/$/, "")) return;
  try {
    await navigator.serviceWorker.register(new URL("sw.js", base), {
      scope: base.pathname,
      updateViaCache: "none",
    });
  } catch (error) {
    console.warn("تعذّر تفعيل تثبيت الصفحة الرئيسية كتطبيق", error);
  }
}
