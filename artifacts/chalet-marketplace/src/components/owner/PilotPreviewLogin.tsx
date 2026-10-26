import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import AuthBrand from "@/components/AuthBrand";
import { isServiceDetailsPilot } from "@/lib/serviceDetailsPilot";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
export const PILOT_DASHBOARD_PATH = "/dashboard?mode=services&activity=service-282&serviceId=282";

/** Development preview only. Authorization still comes from the real owner API. */
export default function PilotPreviewLogin() {
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    async function enterPreview() {
      try {
        const response = await fetch(`${BASE}/api/providers/my/approved`, { credentials: "include" });
        if (response.status === 401) {
          // Verify the current Replit identity, then return here to check ownership.
          window.location.replace(`${BASE}/api/login?returnTo=${encodeURIComponent(`${BASE}/login`)}`);
          return;
        }
        if (!response.ok) throw new Error("تعذر التحقق من صلاحية الوصول. أعد المحاولة.");
        const providers: { id: number }[] = await response.json();
        if (!providers.some(provider => isServiceDetailsPilot(provider.id))) {
          setError("حساب Replit الحالي غير مرتبط بنشاط نطيطات غيث. سجّل الدخول بهوية صاحب النشاط لمعاينة بياناته.");
          return;
        }
        window.location.replace(`${BASE}${PILOT_DASHBOARD_PATH}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "تعذر فتح المعاينة. أعد المحاولة.");
      }
    }
    void enterPreview();
  }, []);

  return <main dir="rtl" className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-6">
    <AuthBrand />
    <section className="w-full max-w-md rounded-2xl border bg-card p-6 text-center space-y-4" data-testid="pilot-preview-entry">
      <h1 className="text-xl font-bold">معاينة نطيطات غيث</h1>
      {error ? <>
        <p role="alert" className="text-sm text-destructive leading-7">{error}</p>
        <button type="button" className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground"
          onClick={() => window.location.reload()}>إعادة المحاولة</button>
        <a className="block text-sm underline" href={`${BASE}/api/logout?returnTo=${encodeURIComponent(`${BASE}/login`)}`}>تغيير حساب Replit</a>
      </> : <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />جارٍ فتح لوحة المزود…
      </p>}
    </section>
  </main>;
}
