import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
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
  selectableType?: boolean;
}

export interface AddonQuote {
  checkoutId: string;
  amountHalala: number;
  unitPriceHalala: number;
  quantity: number;
  publishableKey: string;
  addonType: "chalet" | "service";
}

export interface PendingCheckout {
  checkoutId: string;
  addonType: "chalet" | "service";
  quantity?: number;
}

interface ReturnAttempt extends PendingCheckout {
  paymentId: string | null;
  status: string | null;
}

type Step = "quote" | "success";

function pendingStorageKey(ownerId: string, addonType: PendingCheckout["addonType"]) {
  return `addon-payment-pending:v2:${ownerId}:${addonType}`;
}

export function readPendingCheckouts(ownerId: string, addonType: PendingCheckout["addonType"]): PendingCheckout[] {
  try {
    const raw = window.sessionStorage.getItem(pendingStorageKey(ownerId, addonType));
    const values = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(values)) return [];
    return values.filter((value) => value?.addonType === addonType &&
      typeof value?.checkoutId === "string" && value.checkoutId)
      .map((value) => ({
        checkoutId: value.checkoutId,
        addonType,
        quantity: Number.isInteger(value.quantity) && value.quantity >= 1 ? value.quantity : 1,
      }));
  } catch {
    return [];
  }
}

function savePendingCheckout(ownerId: string, checkout: PendingCheckout): boolean {
  try {
    const pending = readPendingCheckouts(ownerId, checkout.addonType)
      .filter((item) => item.checkoutId !== checkout.checkoutId);
    window.sessionStorage.setItem(pendingStorageKey(ownerId, checkout.addonType), JSON.stringify([...pending, checkout]));
    return true;
  } catch {
    return false;
  }
}

export function clearPendingCheckout(ownerId: string, checkout: PendingCheckout) {
  try {
    const remaining = readPendingCheckouts(ownerId, checkout.addonType)
      .filter((pending) => pending.checkoutId !== checkout.checkoutId);
    window.sessionStorage.setItem(pendingStorageKey(ownerId, checkout.addonType), JSON.stringify(remaining));
  } catch {
    // Confirmation remains successful if browser storage is unavailable.
  }
}

function readLegacyPendingCheckout(addonType: PendingCheckout["addonType"]): PendingCheckout | null {
  try {
    const raw = window.sessionStorage.getItem(`addon-payment-pending:v1:${addonType}`);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (value?.addonType !== addonType || typeof value.checkoutId !== "string") return null;
    return { checkoutId: value.checkoutId, addonType, quantity: 1 };
  } catch {
    return null;
  }
}

function clearPaymentReturnParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("checkout_flow");
  url.searchParams.delete("addon_checkout");
  for (const name of ["id", "payment_id", "paymentId", "status", "payment_status", "paymentStatus"]) {
    url.searchParams.delete(name);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function useMoyasarScript() {
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

export function AddonPaymentModal({ open, onClose, addonType, selectableType = false }: AddonPaymentModalProps) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const ownerId = user?.id ?? "";
  const queryClient = useQueryClient();
  const { data: currentLimits, isLoading: isPriceLoading, isError: isPriceError } = useQuery<{
    extraChaletPrice: number | string | null;
    extraServicePrice: number | string | null;
    chaletCount: number;
    chaletLimit: number;
    serviceCount: number;
    serviceLimit: number;
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
  const [step, setStep] = useState<Step>("quote");
  const [selectedType, setSelectedType] = useState<"chalet" | "service">(addonType);
  const [quantity, setQuantity] = useState(1);
  const [completedQuantity, setCompletedQuantity] = useState(1);
  const [completedType, setCompletedType] = useState<"chalet" | "service">(addonType);
  const [error, setError] = useState<string | null>(null);
  const [returnAttempt, setReturnAttempt] = useState<ReturnAttempt | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const handledReturnRef = useRef<string | null>(null);

  const activeAddonType = returnAttempt?.addonType ?? selectedType;
  const label = activeAddonType === "chalet" ? "عقار إضافي" : "خدمة إضافية";
  const listedPrice = activeAddonType === "chalet" ? currentLimits?.extraChaletPrice : currentLimits?.extraServicePrice;
  const numericPrice = listedPrice == null ? null : Number(listedPrice);
  const validPrice = numericPrice !== null && Number.isFinite(numericPrice) && numericPrice >= 0;
  const freeCapacityAvailable = numericPrice === 0 && currentLimits != null &&
    (activeAddonType === "chalet"
      ? currentLimits.chaletCount < currentLimits.chaletLimit
      : currentLimits.serviceCount < currentLimits.serviceLimit);

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

  const handleSuccess = (purchasedQuantity: number, purchasedType: "chalet" | "service") => {
    setCompletedQuantity(purchasedQuantity);
    setCompletedType(purchasedType);
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
    onSuccess: (data, checkout) => {
      clearPendingCheckout(ownerId, checkout);
      try {
        const legacy = readLegacyPendingCheckout(checkout.addonType);
        if (legacy?.checkoutId === checkout.checkoutId) {
          window.sessionStorage.removeItem(`addon-payment-pending:v1:${checkout.addonType}`);
        }
      } catch { /* server confirmation has already succeeded */ }
      if (checkout.isRedirectReturn) {
        clearPaymentReturnParams();
        setReturnAttempt(null);
        setReturnNotice(null);
        setReturnDialogOpen(true);
        handledReturnRef.current = null;
      }
      handleSuccess(Number(data.purchase?.quantity ?? checkout.quantity ?? 1), checkout.addonType);
    },
    onError: (cause: Error) => {
      setError(cause.message);
      setReturnNotice(null);
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async (checkout: PendingCheckout & { quantity: number }) => {
      const response = await apiFetch("/owner/subscription/addons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId: checkout.checkoutId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر تفعيل الإضافة");
      return data;
    },
    onSuccess: (data, checkout) => handleSuccess(Number(data.purchase?.quantity ?? checkout.quantity), checkout.addonType),
    onError: (cause: Error) => setError(cause.message),
  });

  const quoteMutation = useMutation({
    mutationFn: async ({ quantity: requestedQuantity, addonType: requestedType }: { quantity: number; addonType: "chalet" | "service" }) => {
      const response = await apiFetch("/owner/subscription/addons/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonType: requestedType, quantity: requestedQuantity }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر احتساب سعر الإضافة");
      const nextQuote: AddonQuote = {
        checkoutId: String(data.checkoutId ?? ""),
        amountHalala: Number(data.amountHalala),
        unitPriceHalala: Number(data.unitPriceHalala),
        quantity: Number(data.quantity),
        publishableKey: String(data.publishableKey ?? ""),
        addonType: data.addonType,
      };
      if (!nextQuote.checkoutId || !Number.isSafeInteger(nextQuote.amountHalala) ||
          nextQuote.amountHalala < 0 || nextQuote.addonType !== requestedType ||
          !Number.isSafeInteger(nextQuote.unitPriceHalala) || nextQuote.unitPriceHalala < 0 ||
          nextQuote.quantity !== requestedQuantity ||
          nextQuote.amountHalala !== nextQuote.unitPriceHalala * nextQuote.quantity) {
        throw new Error("تعذّر التحقق من عرض سعر الإضافة");
      }
      if (nextQuote.amountHalala > 0 && !nextQuote.publishableKey) {
        throw new Error("بوابة الدفع غير مهيأة لإتمام شراء الإضافة");
      }
      return nextQuote;
    },
    onSuccess: (nextQuote) => {
      setError(null);
      if (nextQuote.amountHalala === 0) {
        redeemMutation.mutate({ checkoutId: nextQuote.checkoutId, addonType: nextQuote.addonType, quantity: nextQuote.quantity });
        return;
      }
      const pending = { checkoutId: nextQuote.checkoutId, addonType: nextQuote.addonType, quantity: nextQuote.quantity };
      if (!ownerId || !savePendingCheckout(ownerId, pending)) {
        setError("تعذّر حفظ عملية الدفع بأمان في هذه الجلسة؛ لم يتم بدء الدفع. يرجى تفعيل التخزين المؤقت أو المحاولة من متصفح آخر.");
        return;
      }
      setReturnNotice(null);
      navigate(`/addon-payment?addon_checkout=${encodeURIComponent(nextQuote.checkoutId)}`);
    },
    onError: (cause: Error) => setError(cause.message),
  });

  const isBusy = quoteMutation.isPending || redeemMutation.isPending || confirmMutation.isPending;

  useEffect(() => {
    if (open) {
      setStep("quote");
      setSelectedType(addonType);
      setQuantity(1);
      setError(null);
      return;
    }
    setStep("quote");
    setError(null);
  }, [open, addonType, ownerId]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("checkout_flow") && params.get("checkout_flow") !== "addon") return;
    const paymentId = params.get("id") || params.get("payment_id") || params.get("paymentId");
    const status = params.get("status") || params.get("payment_status") || params.get("paymentStatus");
    if (!paymentId && !status) return;

    const checkoutId = params.get("addon_checkout");
    const storedCheckouts = ownerId ? (["chalet", "service"] as const)
      .flatMap((type) => readPendingCheckouts(ownerId, type)) : [];
    const legacyCheckouts = (["chalet", "service"] as const)
      .map(readLegacyPendingCheckout)
      .filter((checkout): checkout is PendingCheckout => checkout !== null);
    const matching = [...storedCheckouts, ...legacyCheckouts];
    const pending = checkoutId
      ? matching.find((checkout) => checkout.checkoutId === checkoutId) ?? null
      : matching.length === 1 ? matching[0] : null;
    const attemptKey = `${paymentId ?? ""}:${status ?? ""}:${pending?.checkoutId ?? ""}`;
    if (handledReturnRef.current === attemptKey) return;
    handledReturnRef.current = attemptKey;
    setReturnDialogOpen(true);
    setStep("quote");

    if (!pending) {
      setReturnAttempt(null);
      setReturnNotice("تعذّر العثور على عملية الإضافة المعلّقة لهذه العودة. لم يبدأ أي طلب دفع جديد.");
      setError("تعذّر مطابقة نتيجة بوابة الدفع مع عملية شراء محفوظة في هذه الجلسة.");
      return;
    }

    const attempt: ReturnAttempt = { ...pending, paymentId, status };
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
  }, [addonType, ownerId]);

  const estimatedTotal = validPrice ?
    (numericPrice * quantity).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : null;
  const purchaseBlocked = !!returnAttempt || !!returnNotice;
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
                 تمت إضافة {completedQuantity.toLocaleString("ar-SA")} {completedType === "chalet" ? "عقار إضافي" : "خدمة إضافية"} إلى الحد المتاح في حسابك الحالي.
              </DialogDescription>
            </div>
            <Button className="w-full" onClick={closeModal}>متابعة</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                {activeAddonType === "chalet" ? <Building2 className="h-5 w-5 text-primary" /> : <Star className="h-5 w-5 text-primary" />}
                 طلب {activeAddonType === "chalet" ? "عقارات إضافية" : "خدمات إضافية"}
              </DialogTitle>
              <DialogDescription id="addon-payment-description">
                 اختر عدد الإضافات المطلوبة؛ تُضاف كلها إلى حسابك الحالي برسوم لمرة واحدة وبدون تجديد تلقائي.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {step === "quote" && (
                !purchaseBlocked ? <>
                  <div className="rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                     {selectableType && (
                       <div role="group" aria-label="نوع الإضافة" className="mb-4 grid grid-cols-2 gap-2">
                         {(["chalet", "service"] as const).map((type) => {
                           const typePrice = type === "chalet" ? currentLimits?.extraChaletPrice : currentLimits?.extraServicePrice;
                           return (
                             <Button key={type} type="button" variant={activeAddonType === type ? "default" : "outline"}
                               data-testid={`button-select-addon-${type}`}
                               className="h-auto min-h-16 flex-col gap-1 whitespace-normal px-2 py-2 text-xs"
                               disabled={isBusy}
                               aria-pressed={activeAddonType === type}
                               onClick={() => { setSelectedType(type); setError(null); }}>
                               <span>{type === "chalet" ? "عقارات إضافية" : "خدمات إضافية"}</span>
                               <span>{isPriceLoading && !currentLimits ? "جارٍ تحميل السعر..." : typePrice == null ? "غير متاح في خطتك" : `${Number(typePrice).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س للوحدة`}</span>
                             </Button>
                           );
                         })}
                       </div>
                     )}
                    <div className="flex items-center gap-2 font-semibold text-foreground">
                      <Plus className="h-4 w-4 text-primary" />
                      {label}
                    </div>
                     <p className="mt-2">الإضافات توسّع باقتك الحالية وتُدار من لوحة التحكم نفسها.</p>
                     <label htmlFor="addon-quantity" className="mt-4 block font-semibold text-foreground">
                       عدد {activeAddonType === "chalet" ? "العقارات الإضافية" : "الخدمات الإضافية"}
                     </label>
                      <input id="addon-quantity" data-testid="input-addon-quantity" type="number" min={1} max={50} step={1} inputMode="numeric"
                       value={quantity} disabled={isBusy}
                       onChange={(event) => setQuantity(Math.min(50, Math.max(1, Math.trunc(Number(event.target.value) || 1))))}
                       className="mt-1 w-24 rounded-md border border-input bg-background px-3 py-2 text-foreground"
                     />
                     {validPrice ? (
                       <div className="mt-3 rounded-lg border border-primary/20 bg-background p-3 text-foreground">
                         <p>سعر الوحدة: {numericPrice.toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س</p>
                         <p className="mt-1 font-bold">الإجمالي التقديري: {quantity.toLocaleString("ar-SA")} × {numericPrice.toLocaleString("ar-SA", { maximumFractionDigits: 2 })} = {estimatedTotal} ر.س</p>
                         <p className="mt-1 text-xs text-muted-foreground">يؤكد الخادم السعر النهائي قبل فتح الدفع.</p>
                       </div>
                    ) : (
                       <p className="mt-2 text-xs">{isPriceLoading ? "جارٍ تحميل سعر الإضافة..." : isPriceError ? "تعذّر تحميل سعر الإضافة. أعد فتح النافذة للمحاولة." : "هذه الإضافة غير متاحة للشراء في خطتك الحالية."}</p>
                    )}
                     {freeCapacityAvailable && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">يمكنك تفعيل الإضافات المجانية بعد استخدام السعة المتاحة في خطتك.</p>}
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
                    {!returnAttempt?.paymentId && (
                      <Button variant="outline" className="w-full" disabled={isBusy}
                        onClick={() => {
                          clearPaymentReturnParams();
                          setReturnAttempt(null);
                          setReturnNotice(null);
                          setReturnDialogOpen(false);
                          setError(null);
                          handledReturnRef.current = null;
                        }}>
                        العودة لاختيار العدد دون حذف الطلب المحفوظ
                      </Button>
                    )}
                    <Button className="w-full" variant="ghost" onClick={closeModal} disabled={isBusy}>
                      إغلاق
                    </Button>
                  </div>
                )
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
                    <Button data-testid="button-request-addon-quote" className="flex-1 gap-2" onClick={() => quoteMutation.mutate({ quantity, addonType: activeAddonType })} disabled={isBusy || !validPrice || isPriceLoading || freeCapacityAvailable}>
                    {quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                      {numericPrice === 0 && validPrice ? "تفعيل الإضافات مجاناً" : "المتابعة إلى الدفع"}
                  </Button>
                  <Button variant="outline" onClick={closeModal} disabled={isBusy}>إلغاء</Button>
                </div>
              )}

            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}