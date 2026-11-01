import { formatDateWithHijri } from "@/lib/hijri";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, CreditCard, Loader2, Package, RefreshCw, ShieldCheck } from "lucide-react";
import { RiyalIcon } from "@/components/icons/RiyalIcon";
import { Navbar } from "@/components/layout/Navbar";
import { addonCheckoutError, addonCheckoutMethods } from "@/lib/addon-checkout-presentation";
import "./AddonCheckoutPage.css";
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
          typeof data.publishableKey !== "string" || !data.publishableKey) {
        throw new Error("تعذّر التحقق من تفاصيل طلب الدفع؛ لم تبدأ عملية دفع.");
      }
      if (pending?.consentToRecurring === true &&
          (data.recurring !== true || data.canSavePaymentMethod !== true ||
            !Number.isSafeInteger(data.nextChargeHalala) || typeof data.nextBillingAt !== "string" ||
            typeof (data.periodEnd ?? data.periodEndAt) !== "string" ||
            !Number.isFinite(data.remainingDays) ||
            !Number.isFinite(data.billingDays ?? data.cycleDays))) {
        throw new Error("لم يؤكد الخادم مبلغ دورة التجديد وموعدها والفترة النسبية أو إمكانية حفظ وسيلة الدفع؛ لم يبدأ الدفع.");
      }
      return {
        ...data,
        periodEnd: data.periodEnd ?? data.periodEndAt,
        billingDays: data.billingDays ?? data.cycleDays,
      } as AddonQuote;
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
      description: `شراء ${quote.addonType === "chalet" ? "عقار إضافي" : "خدمة إضافية"} — تكيّة [${checkoutId}]`,
      publishable_api_key: quote.publishableKey,
      callback_url: callbackUrl.toString(),
      on_completed: (payment: { id?: string; status?: string }) => {
        if (payment.status === "paid" && payment.id) {
          setInlinePaymentId(payment.id);
          setError(null);
          confirmMutation.mutate(payment.id);
        } else {
          setError("لم يكتمل الدفع. يرجى التحقق من بيانات وسيلة الدفع والمحاولة مجدداً.");
        }
        return false;
      },
      methods: addonCheckoutMethods(pending.consentToRecurring === true),
      supported_networks: ["mada", "visa", "mastercard"],
      ...(pending.consentToRecurring === true ? { credit_card: { save_card: true } } : {}),
      language: "ar",
    });
    return () => { container.innerHTML = ""; };
  }, [checkoutId, quoteQuery.data?.checkoutId, scriptReady, inlinePaymentId, completedQuantity, isGatewayReturn]);

  const paymentIdToRetry = inlinePaymentId || returnPaymentId;
  const label = (completedType ?? pending?.addonType) === "service" ? "خدمة إضافية" : "عقار إضافي";
  const quote = quoteQuery.data;

  const money = (halala: number) => (halala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 });
  const num = (n: number) => n.toLocaleString("ar-SA");
  const Amount = ({ halala, big }: { halala: number; big?: boolean }) => (
    <bdi dir="rtl" className="inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap">
      {money(halala)}<RiyalIcon className={big ? "h-6 w-6 sm:h-7 sm:w-7" : "h-4 w-4"} />
    </bdi>
  );
  const DateText = ({ value }: { value: string }) => <bdi dir="rtl">{formatDateWithHijri(value)}</bdi>;
  const StatusLine = ({ children }: { children: React.ReactNode }) => (
    <div role="status" className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 p-4 text-sm leading-7">
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" /><span>{children}</span>
    </div>
  );
  const AlertBox = ({ children }: { children: React.ReactNode }) => (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-7 text-destructive">
      <AlertTriangle className="mt-1 h-5 w-5 shrink-0" /><div>{children}</div>
    </div>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:py-14">
        <Button variant="ghost" className="mb-5 h-11 gap-2 px-3" onClick={() => navigate("/dashboard")}>
          <ArrowRight className="h-4 w-4" /> العودة إلى لوحة التحكم
        </Button>
        <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          {completedQuantity !== null ? (
            <div className="space-y-5 px-6 py-10 text-center sm:px-10" data-testid="status-addon-payment-success">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-600/10">
                <CheckCircle2 className="h-11 w-11 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold sm:text-3xl">تمت إضافة السعة تلقائياً</h1>
              <p className="mx-auto max-w-md text-base leading-8 text-muted-foreground">
                تأكد الدفع وأُضيفت {num(completedQuantity)} {label} إلى حسابك. يمكنك استخدام السعة الجديدة الآن دون انتظار اعتماد المشرف.
              </p>
              <Button size="lg" className="h-12 w-full px-8 text-base sm:w-auto" onClick={() => navigate("/dashboard")}>العودة إلى لوحة التحكم</Button>
            </div>
          ) : (
            <>
              <header className="border-b border-border bg-primary/5 px-5 py-6 sm:px-8">
                <h1 className="flex items-center gap-3 text-2xl font-bold">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10"><CreditCard className="h-6 w-6 text-primary" /></span>
                  دفع الإضافات
                </h1>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">تظهر السعة في حسابك فور تأكيد الدفع من البوابة، دون تغيير باقتك الأساسية.</p>
              </header>
              <div className="space-y-5 px-5 py-6 sm:px-8 sm:py-8">
              {!ownerId ? (
                <StatusLine>جارٍ التحقق من حسابك...</StatusLine>
              ) : !pending && !returnPaymentId ? (
                <AlertBox>لم يُعثر على طلب دفع محفوظ لهذا الحساب. ارجع إلى لوحة التحكم واختر العدد مجدداً؛ لم تبدأ عملية دفع جديدة.</AlertBox>
              ) : (
                <>
                  {pending && <section className="space-y-4">
                    <div className="flex items-center gap-3 rounded-2xl border border-border p-4">
                      <Package className="h-5 w-5 shrink-0 text-primary" />
                      <p className="text-base font-semibold">{pending.quantity != null ? num(pending.quantity) : ""} × {label}</p>
                    </div>
                    {quote && (
                      <>
                        <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5 text-center sm:p-6">
                          <p className="text-sm font-medium text-muted-foreground">المستحق الآن للفترة المتبقية</p>
                          <p className="mt-2 text-3xl font-extrabold text-primary sm:text-4xl" data-testid="text-addon-checkout-total">
                            <Amount halala={quote.amountHalala} big />
                          </p>
                          {quote.remainingDays != null && quote.billingDays != null && (
                            <p className="mt-3 text-sm leading-7 text-muted-foreground">
                              محسوباً عن {num(quote.remainingDays)} من {num(quote.billingDays)} يوماً حتى نهاية الفترة {quote.periodEnd ? <DateText value={quote.periodEnd} /> : "الحالية"}.
                            </p>
                          )}
                        </div>
                        <dl className="divide-y divide-border rounded-2xl border border-border text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                            <dt className="text-muted-foreground">السعر المرجعي الكامل للوحدة لكل ٣٠ يوماً</dt>
                            <dd className="font-semibold"><Amount halala={quote.unitPriceHalala} /></dd>
                          </div>
                          {pending.consentToRecurring === true && quote.nextChargeHalala != null && (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                                <dt className="flex items-center gap-2 text-muted-foreground"><RefreshCw className="h-4 w-4" />
                                  إجمالي الفاتورة الموحدة {quote.billingDays === 30 ? "عند التجديد الشهري" : <>لدورة التجديد (<bdi>{num(quote.billingDays ?? 0)}</bdi> يوم)</>}
                                </dt>
                                <dd className="font-semibold"><Amount halala={quote.nextChargeHalala} /></dd>
                              </div>
                              {quote.nextBillingAt && (
                                <div className="flex flex-wrap items-center justify-between gap-2 p-4">
                                  <dt className="flex items-center gap-2 text-muted-foreground"><CalendarClock className="h-4 w-4" /> موعد التجديد التالي</dt>
                                  <dd className="font-semibold"><DateText value={quote.nextBillingAt} /></dd>
                                </div>
                              )}
                            </>
                          )}
                        </dl>
                      </>
                    )}
                    <p className="rounded-2xl bg-muted/50 p-4 text-sm leading-7 text-muted-foreground">
                      {pending.consentToRecurring === true
                        ? "بموافقتك، يُحفظ أسلوب الدفع وتُضم الإضافة إلى فاتورة تجديد الاشتراك الأساسية. لن يبدأ التحصيل الدوري ما لم يؤكده الخادم."
                        : "طلب دفع سابق غير متكرر؛ لا تُحفظ وسيلة الدفع ولا يُفعّل التجديد التلقائي."}
                    </p>
                  </section>}
                  {!isGatewayReturn && !inlinePaymentId && pending && (
                    <>
                      {quoteQuery.isPending && <StatusLine>جارٍ تثبيت السعر وتحميل الدفع...</StatusLine>}
                      {quoteQuery.isError && <AlertBox>{addonCheckoutError((quoteQuery.error as Error).message)}</AlertBox>}
                      {quote && !scriptReady && !scriptFailed && <StatusLine>جارٍ تحميل بوابة الدفع...</StatusLine>}
                      {quote && scriptFailed && <AlertBox>تعذّر تحميل بوابة الدفع. أعد تحميل الصفحة للمحاولة.</AlertBox>}
                      {quote && <section aria-label="وسيلة الدفع" className="addon-checkout-gateway space-y-4 rounded-2xl border border-border p-4 sm:p-5">
                        <h2 className="text-lg font-bold">وسيلة الدفع</h2>
                        <p className="text-sm leading-7 text-foreground/80">أدخل بيانات وسيلة الدفع المتاحة أدناه لإكمال الطلب بأمان.</p>
                        <div ref={formRef} data-testid="form-addon-gateway" />
                      </section>}
                    </>
                  )}
                  {(returnPaymentId || inlinePaymentId) && !error && (
                    <StatusLine>جارٍ التحقق من الدفع وفتح السعة...</StatusLine>
                  )}
                  {isGatewayReturn && !returnPaymentId && (
                    <AlertBox>لم ترسل بوابة الدفع رقم العملية. لا يمكن فتح السعة قبل التحقق من الدفع.</AlertBox>
                  )}
                  {error && <AlertBox>{addonCheckoutError(error)}</AlertBox>}
                  {error && paymentIdToRetry && (
                    <Button className="h-12 w-full text-base sm:w-auto sm:px-8" variant="outline" disabled={confirmMutation.isPending}
                      onClick={() => { setError(null); confirmMutation.mutate(paymentIdToRetry); }}>
                      إعادة التحقق من الدفع
                    </Button>
                  )}
                  <p className="flex items-start gap-3 border-t border-border pt-5 text-sm leading-7 text-muted-foreground">
                    <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-green-600" />
                    لا تُفتح السعة اعتماداً على نتيجة المتصفح وحدها؛ يتحقق الخادم من حالة الدفع والمبلغ لدى البوابة أولاً.
                  </p>
                </>
              )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
