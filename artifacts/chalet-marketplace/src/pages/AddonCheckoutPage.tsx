import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Loader2, ShieldCheck } from "lucide-react";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import {
  clearPendingCheckout, readPendingCheckouts, useMoyasarScript,
  type AddonQuote, type PendingCheckout,
} from "@/components/AddonPaymentModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { credentials: "include", ...options });
}

export default function AddonCheckoutPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const ownerId = user?.id ?? "";
  const queryClient = useQueryClient();
  const params = new URLSearchParams(window.location.search);
  const checkoutId = params.get("addon_checkout") ?? "";
  const returnStatus = params.get("status") || params.get("payment_status") || params.get("paymentStatus");
  const returnPaymentId = params.get("id") || params.get("payment_id") || params.get("paymentId");
  const isGatewayReturn = params.get("checkout_flow") === "addon" || !!returnPaymentId || !!returnStatus;
  const pending: PendingCheckout | undefined = ownerId && checkoutId
    ? (["chalet", "service"] as const)
      .flatMap((type) => readPendingCheckouts(ownerId, type))
      .find((item) => item.checkoutId === checkoutId)
    : undefined;

  const [inlinePaymentId, setInlinePaymentId] = useState<string | null>(null);
  const [completedQuantity, setCompletedQuantity] = useState<number | null>(null);
  const [completedType, setCompletedType] = useState<"chalet" | "service" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handledReturn = useRef<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const { ready: scriptReady, failed: scriptFailed } = useMoyasarScript();

  const quoteQuery = useQuery<AddonQuote>({
    queryKey: ["owner", "addon-checkout", ownerId, checkoutId],
    queryFn: async () => {
      if (!pending) throw new Error("لم يُعثر على طلب الدفع في هذه الجلسة.");
      const response = await apiFetch(`/owner/subscription/addons/checkouts/${encodeURIComponent(checkoutId)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر تحميل طلب الدفع");
      if (data.checkoutId !== checkoutId || data.addonType !== pending?.addonType ||
          data.quantity !== pending.quantity || !Number.isSafeInteger(data.amountHalala) ||
          data.amountHalala <= 0 || !Number.isSafeInteger(data.unitPriceHalala) ||
          data.unitPriceHalala * data.quantity !== data.amountHalala ||
          typeof data.publishableKey !== "string" || !data.publishableKey) {
        throw new Error("تعذّر التحقق من تفاصيل طلب الدفع؛ لم تبدأ عملية دفع.");
      }
      return data as AddonQuote;
    },
    enabled: !!ownerId && !!pending && !isGatewayReturn && !inlinePaymentId && completedQuantity === null,
    retry: false,
    staleTime: 0,
  });

  const confirmMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const response = await apiFetch("/owner/subscription/addons/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId, paymentId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر تأكيد الدفع");
      return data as { purchase?: { quantity?: number; addonType?: "chalet" | "service" } };
    },
    onSuccess: (data) => {
      if (pending) clearPendingCheckout(ownerId, pending);
      setCompletedQuantity(Number(data.purchase?.quantity ?? pending?.quantity ?? 1));
      setCompletedType(data.purchase?.addonType ?? pending?.addonType ?? null);
      setError(null);
      for (const queryKey of [
        ["owner", "plan-limits"], ["owner", "subscription"], ["owner", "subscription-header"],
        ["owner", "chalets"], ["owner", "submissions"], ["owner", "services"],
        ["my-service-submissions"], ["my-approved-providers"],
      ]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    },
    onError: (cause: Error) => setError(cause.message),
  });

  useEffect(() => {
    if (!ownerId || !checkoutId || !returnPaymentId || completedQuantity !== null) return;
    const attempt = `${checkoutId}:${returnPaymentId}`;
    if (handledReturn.current === attempt) return;
    handledReturn.current = attempt;
    confirmMutation.mutate(returnPaymentId);
  }, [ownerId, checkoutId, returnPaymentId, completedQuantity]);

  useEffect(() => {
    const quote = quoteQuery.data;
    if (!quote || !pending || !scriptReady || !formRef.current ||
        inlinePaymentId || completedQuantity !== null || isGatewayReturn) return;
    const Moyasar = (window as any).Moyasar;
    if (!Moyasar) return;
    const container = formRef.current;
    container.innerHTML = "";
    const callbackUrl = new URL(`${BASE}/addon-payment`, window.location.origin);
    callbackUrl.searchParams.set("checkout_flow", "addon");
    callbackUrl.searchParams.set("addon_checkout", checkoutId);
    Moyasar.init({
      element: container,
      amount: quote.amountHalala,
      currency: "SAR",
      description: `شراء ${quote.addonType === "chalet" ? "عقار إضافي" : "خدمة إضافية"} — حكاية أناقة [${checkoutId}]`,
      publishable_api_key: quote.publishableKey,
      callback_url: callbackUrl.toString(),
      on_completed: (payment: { id?: string; status?: string }) => {
        if (payment.status === "paid" && payment.id) {
          setInlinePaymentId(payment.id);
          setError(null);
          confirmMutation.mutate(payment.id);
        } else {
          setError(`لم يكتمل الدفع. الحالة: ${payment.status ?? "غير معروفة"}`);
        }
        return false;
      },
      supported_networks: ["mada", "visaMastercard", "stcpay", "applepay"],
      language: "ar",
    });
    return () => { container.innerHTML = ""; };
  }, [checkoutId, quoteQuery.data?.checkoutId, scriptReady, inlinePaymentId, completedQuantity, isGatewayReturn]);

  const paymentIdToRetry = inlinePaymentId || returnPaymentId;
  const label = (completedType ?? pending?.addonType) === "service" ? "خدمة إضافية" : "عقار إضافي";
  const quote = quoteQuery.data;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-10 sm:py-16">
        <Button variant="ghost" className="mb-6 gap-2" onClick={() => navigate("/dashboard")}>
          <ArrowRight className="h-4 w-4" /> العودة إلى لوحة التحكم
        </Button>
        <div className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-8">
          {completedQuantity !== null ? (
            <div className="space-y-4 py-6 text-center" data-testid="status-addon-payment-success">
              <CheckCircle2 className="mx-auto h-14 w-14 text-green-600" />
              <h1 className="text-2xl font-bold">تمت إضافة السعة تلقائياً</h1>
              <p className="text-muted-foreground">
                تأكد الدفع وأُضيفت {completedQuantity.toLocaleString("ar-SA")} {label} إلى حسابك. يمكنك استخدام السعة الجديدة الآن دون انتظار اعتماد المشرف.
              </p>
              <Button onClick={() => navigate("/dashboard")}>العودة إلى لوحة التحكم</Button>
            </div>
          ) : (
            <>
              <h1 className="flex items-center gap-2 text-2xl font-bold">
                <CreditCard className="h-6 w-6 text-primary" /> دفع الإضافات
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">تظهر السعة في حسابك فور تأكيد الدفع من البوابة، دون تغيير باقتك الأساسية.</p>
              {!ownerId ? (
                <p className="mt-6 text-sm text-muted-foreground">جارٍ التحقق من حسابك...</p>
              ) : !pending && !returnPaymentId ? (
                <p role="alert" className="mt-6 text-sm text-destructive">لم يُعثر على طلب دفع محفوظ لهذا الحساب. ارجع إلى لوحة التحكم واختر العدد مجدداً؛ لم تبدأ عملية دفع جديدة.</p>
              ) : (
                <>
                  {pending && <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <p className="font-semibold">{pending.quantity?.toLocaleString("ar-SA")} × {label}</p>
                    {quote && (
                      <>
                        <p className="mt-1 text-sm text-muted-foreground">سعر الوحدة: {(quote.unitPriceHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س</p>
                        <p className="mt-2 text-xl font-bold text-primary" data-testid="text-addon-checkout-total">
                          الإجمالي: {(quote.amountHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ر.س
                        </p>
                      </>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">دفعة واحدة — لا يوجد تجديد تلقائي</p>
                  </div>}
                  {!isGatewayReturn && !inlinePaymentId && pending && (
                    <>
                      {quoteQuery.isPending && <p role="status" className="mt-6 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ تثبيت السعر وتحميل الدفع...</p>}
                      {quoteQuery.isError && <p role="alert" className="mt-6 text-sm text-destructive">{(quoteQuery.error as Error).message}</p>}
                      {quote && !scriptReady && !scriptFailed && <p role="status" className="mt-6 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل بوابة الدفع...</p>}
                      {quote && scriptFailed && <p role="alert" className="mt-6 text-sm text-destructive">تعذّر تحميل بوابة الدفع. أعد تحميل الصفحة للمحاولة.</p>}
                      {quote && <div ref={formRef} className="mt-6" data-testid="form-addon-gateway" />}
                    </>
                  )}
                  {(returnPaymentId || inlinePaymentId) && !error && (
                    <p role="status" className="mt-6 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" /> جارٍ التحقق من الدفع وفتح السعة...</p>
                  )}
                  {isGatewayReturn && !returnPaymentId && (
                    <p role="alert" className="mt-6 text-sm text-destructive">لم ترسل بوابة الدفع رقم العملية. لا يمكن فتح السعة قبل التحقق من الدفع.</p>
                  )}
                  {error && (
                    <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
                    </div>
                  )}
                  {error && paymentIdToRetry && (
                    <Button className="mt-4" variant="outline" disabled={confirmMutation.isPending}
                      onClick={() => { setError(null); confirmMutation.mutate(paymentIdToRetry); }}>
                      إعادة التحقق من الدفع
                    </Button>
                  )}
                  <p className="mt-5 flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
                    لا تُفتح السعة اعتماداً على نتيجة المتصفح وحدها؛ يتحقق الخادم من حالة الدفع والمبلغ لدى البوابة أولاً.
                  </p>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}