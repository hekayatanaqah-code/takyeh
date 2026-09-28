import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Building2, CheckCircle2, CreditCard, Loader2, Plus, ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, options?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { credentials: "include", ...options });
}

interface AddonPaymentModalProps {
  open: boolean;
  onClose: () => void;
  addonType: "chalet" | "service";
}

interface AddonQuote {
  checkoutId: string;
  amountHalala: number;
  publishableKey: string;
  addonType: "chalet" | "service";
}

interface PendingCheckout {
  checkoutId: string;
  addonType: "chalet" | "service";
}

interface ReturnAttempt extends PendingCheckout {
  paymentId: string | null;
  status: string | null;
}

type Step = "quote" | "pay" | "success";

function pendingStorageKey(addonType: PendingCheckout["addonType"]) {
  return `addon-payment-pending:v1:${addonType}`;
}

function readPendingCheckout(addonType: PendingCheckout["addonType"]): PendingCheckout | null {
  try {
    const raw = window.sessionStorage.getItem(pendingStorageKey(addonType));
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value?.addonType !== addonType || typeof value?.checkoutId !== "string" || !value.checkoutId) return null;
    return { checkoutId: value.checkoutId, addonType };
  } catch {
    return null;
  }
}

function savePendingCheckout(checkout: PendingCheckout): boolean {
  try {
    window.sessionStorage.setItem(pendingStorageKey(checkout.addonType), JSON.stringify(checkout));
    return true;
  } catch {
    return false;
  }
}

function clearPendingCheckout(checkout: PendingCheckout) {
  try {
    const pending = readPendingCheckout(checkout.addonType);
    if (pending?.checkoutId === checkout.checkoutId) {
      window.sessionStorage.removeItem(pendingStorageKey(checkout.addonType));
    }
  } catch {
    // Confirmation remains successful if browser storage is unavailable.
  }
}

function clearPaymentReturnParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout_flow");
  for (const name of ["id", "payment_id", "paymentId", "status", "payment_status", "paymentStatus"]) {
    url.searchParams.delete(name);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function useMoyasarScript() {
  const [ready, setReady] = useState(() => !!(window as any).Moyasar);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if ((window as any).Moyasar) {
      setReady(true);
      return;
    }
    let script = document.querySelector<HTMLScriptElement>('script[src*="cdn.moyasar.com/mpf/1.14.0/moyasar.js"]');
    const onLoad = () => {
      setReady(true);
      setFailed(false);
    };
    const onError = () => setFailed(true);

    if (!document.querySelector('link[href*="cdn.moyasar.com/mpf/1.14.0/moyasar.css"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";
      document.head.appendChild(stylesheet);
    }
    if (!script) {
      script = document.createElement("script");
      script.src = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", onLoad);
    script.addEventListener("error", onError);
    if ((window as any).Moyasar) onLoad();
    return () => {
      script?.removeEventListener("load", onLoad);
      script?.removeEventListener("error", onError);
    };
  }, []);

  return { ready, failed };
}

export function AddonPaymentModal({ open, onClose, addonType }: AddonPaymentModalProps) {
  const queryClient = useQueryClient();
  const { data: currentLimits, isLoading: isPriceLoading } = useQuery<{
    extraChaletPrice: number | string | null;
    extraServicePrice: number | string | null;
  }>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const response = await apiFetch("/owner/plan-limits");
      if (!response.ok) throw new Error("تعذّر تحميل سعر الإضافة");
      return response.json();
    },
    enabled: open,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const { ready: scriptReady, failed: scriptFailed } = useMoyasarScript();
  const formContainerRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<any>(null);
  const [step, setStep] = useState<Step>("quote");
  const [quote, setQuote] = useState<AddonQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<PendingCheckout | null>(() => readPendingCheckout(addonType));
  const [returnAttempt, setReturnAttempt] = useState<ReturnAttempt | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const handledReturnRef = useRef<string | null>(null);

  const activeAddonType = returnAttempt?.addonType ?? addonType;
  const label = activeAddonType === "chalet" ? "عقار إضافي" : "خدمة إضافية";
  const listedPrice = activeAddonType === "chalet" ? currentLimits?.extraChaletPrice : currentLimits?.extraServicePrice;

  function refreshOwnerData() {
    for (const queryKey of [
      ["owner", "plan-limits"],
      ["owner", "subscription"],
      ["owner", "subscription-header"],
      ["owner", "chalets"],
      ["my-service-submissions"],
      ["my-approved-providers"],
      ["owner", "services"],
      ["owner", "service-providers"],
      ["owner", "submissions"],
    ]) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }

  const handleSuccess = () => {
    setCompleted(true);
    setError(null);
    setStep("success");
    refreshOwnerData();
  };

  const confirmMutation = useMutation({
    mutationFn: async (checkout: PendingCheckout & { paymentId: string; isRedirectReturn?: boolean }) => {
      const response = await apiFetch("/owner/subscription/addons/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId: checkout.checkoutId, paymentId: checkout.paymentId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر تأكيد الدفع");
      return data;
    },
    onSuccess: (_data, checkout) => {
      clearPendingCheckout(checkout);
      if (checkout.isRedirectReturn) {
        clearPaymentReturnParams();
        setReturnAttempt(null);
        setReturnNotice(null);
        setReturnDialogOpen(true);
        handledReturnRef.current = null;
      }
      setPendingCheckout((current) => current?.checkoutId === checkout.checkoutId ? null : current);
      handleSuccess();
    },
    onError: (cause: Error) => {
      setError(cause.message);
      setReturnNotice(null);
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async (checkoutId: string) => {
      const response = await apiFetch("/owner/subscription/addons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر تفعيل الإضافة");
      return data;
    },
    onSuccess: handleSuccess,
    onError: (cause: Error) => setError(cause.message),
  });

  const quoteMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/owner/subscription/addons/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonType }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر احتساب سعر الإضافة");
      const nextQuote: AddonQuote = {
        checkoutId: String(data.checkoutId ?? ""),
        amountHalala: Number(data.amountHalala),
        publishableKey: String(data.publishableKey ?? ""),
        addonType: data.addonType,
      };
      if (!nextQuote.checkoutId || !Number.isSafeInteger(nextQuote.amountHalala) ||
          nextQuote.amountHalala < 0 || nextQuote.addonType !== addonType) {
        throw new Error("تعذّر التحقق من عرض سعر الإضافة");
      }
      if (nextQuote.amountHalala > 0 && !nextQuote.publishableKey) {
        throw new Error("بوابة الدفع غير مهيأة لإتمام شراء الإضافة");
      }
      return nextQuote;
    },
    onSuccess: (nextQuote) => {
      setQuote(nextQuote);
      setError(null);
      if (nextQuote.amountHalala === 0) {
        redeemMutation.mutate(nextQuote.checkoutId);
        return;
      }
      const pending = { checkoutId: nextQuote.checkoutId, addonType: nextQuote.addonType };
      if (!savePendingCheckout(pending)) {
        setQuote(null);
        setError("تعذّر حفظ عملية الدفع بأمان في هذه الجلسة؛ لم يتم بدء الدفع. يرجى تفعيل التخزين المؤقت أو المحاولة من متصفح آخر.");
        return;
      }
      setPendingCheckout(pending);
      setReturnNotice(null);
      setStep("pay");
    },
    onError: (cause: Error) => setError(cause.message),
  });

  const isBusy = quoteMutation.isPending || redeemMutation.isPending || confirmMutation.isPending;

  useEffect(() => {
    if (!open || step !== "pay" || !scriptReady || !quote || !formContainerRef.current) return;
    const Moyasar = (window as any).Moyasar;
    if (!Moyasar) return;

    const container = formContainerRef.current;
    container.innerHTML = "";
    checkoutRef.current = Moyasar.init({
      element: container,
      amount: quote.amountHalala,
      currency: "SAR",
      description: `شراء ${label} — حكاية أناقة [${quote.checkoutId}]`,
      publishable_api_key: quote.publishableKey,
      callback_url: (() => {
        const url = new URL(window.location.href);
        url.searchParams.set("checkout_flow", "addon");
        return url.toString();
      })(),
      on_completed: (payment: { id: string; status: string }) => {
        if (payment.status === "paid") {
          confirmMutation.mutate({
            paymentId: payment.id,
            checkoutId: quote.checkoutId,
            addonType: quote.addonType,
            isRedirectReturn: false,
          });
        }
        else setError(`لم يكتمل الدفع. الحالة: ${payment.status}`);
        return false;
      },
      supported_networks: ["mada", "visaMastercard", "stcpay", "applepay"],
      language: "ar",
    });

    return () => {
      container.innerHTML = "";
      checkoutRef.current = null;
    };
  }, [open, step, scriptReady, quote?.checkoutId, quote?.amountHalala, quote?.publishableKey, label]);

  useEffect(() => {
    if (open) {
      setStep("quote");
      setQuote(null);
      setError(null);
      setCompleted(false);
      setPendingCheckout(readPendingCheckout(addonType));
      return;
    }
    setStep("quote");
    setQuote(null);
    setError(null);
    setCompleted(false);
    checkoutRef.current = null;
  }, [open, addonType]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("checkout_flow") && params.get("checkout_flow") !== "addon") return;
    const paymentId = params.get("id") || params.get("payment_id") || params.get("paymentId");
    const status = params.get("status") || params.get("payment_status") || params.get("paymentStatus");
    if (!paymentId && !status) return;

    const storedCheckouts = (["chalet", "service"] as const)
      .map(readPendingCheckout)
      .filter((checkout): checkout is PendingCheckout => checkout !== null);
    const pending = paymentId
      ? (storedCheckouts.length === 1 ? storedCheckouts[0] : storedCheckouts.find((checkout) => checkout.addonType === addonType) ?? null)
      : storedCheckouts.find((checkout) => checkout.addonType === addonType) ??
        (storedCheckouts.length === 1 ? storedCheckouts[0] : null);
    const attemptKey = `${paymentId ?? ""}:${status ?? ""}:${pending?.checkoutId ?? ""}`;
    if (handledReturnRef.current === attemptKey) return;
    handledReturnRef.current = attemptKey;
    setReturnDialogOpen(true);
    setStep("quote");
    setQuote(null);

    if (!pending) {
      setReturnAttempt(null);
      setReturnNotice("تعذّر العثور على عملية الإضافة المعلّقة لهذه العودة. لم يبدأ أي طلب دفع جديد.");
      setError("تعذّر مطابقة نتيجة بوابة الدفع مع عملية شراء محفوظة في هذه الجلسة.");
      return;
    }

    const attempt: ReturnAttempt = { ...pending, paymentId, status };
    setPendingCheckout(pending);
    setReturnAttempt(attempt);
    setError(null);
    if (!paymentId) {
      setReturnNotice(status
        ? `عادت بوابة الدفع بالحالة «${status}» دون رقم عملية؛ لا يمكن تأكيدها بعد.`
        : "لا يوجد رقم عملية دفع في رابط العودة؛ لم يتم بدء عملية دفع جديدة.");
      return;
    }

    setReturnNotice(status
      ? `عادت بوابة الدفع بالحالة «${status}»؛ جارٍ التحقق من النتيجة مع الخادم.`
      : "جارٍ التحقق من نتيجة الدفع مع الخادم...");
    confirmMutation.mutate({
      checkoutId: pending.checkoutId,
      addonType: pending.addonType,
      paymentId,
      isRedirectReturn: true,
    });
  }, [addonType]);

  const amountLabel = quote
    ? (quote.amountHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;
  const unresolvedCheckout = returnAttempt ?? (
    pendingCheckout?.addonType === activeAddonType ? pendingCheckout : null
  );
  const purchaseBlocked = !!unresolvedCheckout || !!returnNotice;
  const closeModal = () => {
    if (isBusy) return;
    setReturnDialogOpen(false);
    onClose();
  };

  return (
    <Dialog open={open || returnDialogOpen} onOpenChange={(nextOpen) => { if (!nextOpen) closeModal(); }}>
      <DialogContent
        dir="rtl"
        className="max-w-md rounded-3xl"
        aria-describedby="addon-payment-description"
      >
        {step === "success" ? (
          <div className="flex flex-col items-center gap-4 py-5 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">تمت إضافة السعة بنجاح</DialogTitle>
              <DialogDescription id="addon-payment-description" className="mt-2">
                يمكنك الآن إضافة {label === "عقار إضافي" ? "عقار" : "خدمة"} واحدة أخرى.
              </DialogDescription>
            </div>
            <Button className="w-full" onClick={closeModal}>متابعة</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                {activeAddonType === "chalet" ? <Building2 className="h-5 w-5 text-primary" /> : <Star className="h-5 w-5 text-primary" />}
                شراء {label}
              </DialogTitle>
              <DialogDescription id="addon-payment-description">
                تُضاف سعة واحدة إلى حد باقتك، برسوم لمرة واحدة فقط وبدون تجديد تلقائي.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {step === "quote" && (
                !purchaseBlocked ? <>
                  <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <Plus className="h-4 w-4 text-primary" />
                      {label}
                    </div>
                    <p className="mt-2">الإضافة توسّع باقتك الحالية دون شراء باقة رئيسية جديدة.</p>
                    {quote ? (
                      <p className="mt-2 font-bold text-foreground">السعر النهائي: {amountLabel} ر.س — لمرة واحدة</p>
                    ) : listedPrice != null ? (
                      <p className="mt-2 font-bold text-foreground">
                        السعر الحالي: {Number(listedPrice).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س — لمرة واحدة
                      </p>
                    ) : (
                      <p className="mt-2 text-xs">{isPriceLoading ? "جارٍ تحميل سعر الإضافة..." : "سيُتحقق من السعر النهائي قبل الدفع."}</p>
                    )}
                  </div>
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                    لن تُفتح السعة الإضافية حتى يؤكد النظام الدفع أو اعتماد الإضافة المجانية.
                  </p>
                </> : (
                  <div className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                    <p className="font-semibold">توجد عملية دفع سابقة قيد التأكيد</p>
                    <p>
                      {returnNotice ?? "لن نبدأ عملية دفع أخرى أو نحذف الطلب المحفوظ قبل تأكيد الخادم لنتيجة العملية."}
                    </p>
                    {returnAttempt?.status && (
                      <p className="text-xs">الحالة الواردة من بوابة الدفع: {returnAttempt.status}</p>
                    )}
                    {returnAttempt?.paymentId && (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => {
                          setError(null);
                          confirmMutation.mutate({
                            checkoutId: returnAttempt.checkoutId,
                            addonType: returnAttempt.addonType,
                            paymentId: returnAttempt.paymentId!,
                            isRedirectReturn: true,
                          });
                        }}
                        disabled={isBusy}
                      >
                        إعادة التحقق من الدفع
                      </Button>
                    )}
                    <Button className="w-full" variant="ghost" onClick={closeModal} disabled={isBusy}>
                      إغلاق
                    </Button>
                  </div>
                )
              )}

              {step === "pay" && (
                <>
                  <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
                    <p className="font-semibold text-foreground">{label}</p>
                    <p className="mt-1 text-xl font-black text-primary">{amountLabel} ر.س</p>
                    <p className="text-xs text-muted-foreground">رسوم لمرة واحدة — لا يوجد تجديد تلقائي</p>
                  </div>
                  {!scriptReady && !scriptFailed && (
                    <div role="status" className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جارٍ تحميل بوابة الدفع...
                    </div>
                  )}
                  {scriptFailed && (
                    <p className="text-sm text-red-600" role="alert">تعذّر تحميل بوابة الدفع. أعد المحاولة لاحقاً.</p>
                  )}
                  <div ref={formContainerRef} />
                </>
              )}

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {isBusy && (
                <div role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ تأكيد الإضافة...
                </div>
              )}

              {step === "quote" && !purchaseBlocked && (
                <div className="flex gap-2">
                  <Button className="flex-1 gap-2" onClick={() => quoteMutation.mutate()} disabled={isBusy}>
                    {quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                    احتساب السعر والمتابعة
                  </Button>
                  <Button variant="outline" onClick={closeModal} disabled={isBusy}>إلغاء</Button>
                </div>
              )}

              {step === "pay" && (
                <Button variant="outline" className="w-full" onClick={() => { setStep("quote"); setQuote(null); setError(null); }} disabled={isBusy}>
                  الرجوع
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}