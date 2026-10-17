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
  nextChargeHalala?: number;
  nextBillingAt?: string | null;
  periodEnd?: string | null;
  periodEndAt?: string | null;
  periodStartAt?: string | null;
  cycleDays?: number;
  remainingDays?: number;
  billingDays?: number;
  recurring?: boolean;
  savedPaymentMethodAvailable?: boolean;
  canSavePaymentMethod?: boolean;
  recurringConfigured?: boolean;
  baseMonthlyHalala?: number;
}

interface AddonPreview {
  addonType: "chalet" | "service";
  quantity: number;
  amountHalala: number;
  monthlyUnitPriceHalala: number;
  remainingDays: number;
  cycleDays: number;
  billingDays: number;
  periodEndAt: string;
  nextBillingAt: string | null;
  nextChargeHalala: number | null;
  baseMonthlyHalala: number;
  recurringConfigured: boolean;
  canSavePaymentMethod: boolean;
}

export interface PendingCheckout {
  checkoutId: string;
  addonType: "chalet" | "service";
  quantity?: number;
  consentToRecurring?: boolean;
}

interface ReturnAttempt extends PendingCheckout {
  paymentId: string | null;
  status: string | null;
}

type Step = "quote" | "success";

function normalizeDigits(value: string) {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
}

function parseQuantity(value: string): number | null {
  const digits = normalizeDigits(value).replace(/\D/g, "");
  if (!digits) return null;
  const parsed = Number(digits);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : null;
}

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
        consentToRecurring: value.consentToRecurring === true,
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
    plan: string;
    extraChaletPrice: number | string | null;
    extraServicePrice: number | string | null;
    chaletCount: number;
    chaletLimit: number;
    serviceCount: number;
    serviceLimit: number;
    baseMonthlyHalala?: number;
    recurringConfigured?: boolean;
    canSavePaymentMethod?: boolean;
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
  const [quantityInput, setQuantityInput] = useState("1");
  const [consentToRecurring, setConsentToRecurring] = useState(false);
  const [completedQuantity, setCompletedQuantity] = useState(1);
  const [completedType, setCompletedType] = useState<"chalet" | "service">(addonType);
  const [error, setError] = useState<string | null>(null);
  const [returnAttempt, setReturnAttempt] = useState<ReturnAttempt | null>(null);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const handledReturnRef = useRef<string | null>(null);

  const activeAddonType = returnAttempt?.addonType ?? (selectableType ? selectedType : addonType);
  const quantity = parseQuantity(quantityInput);
  const label = activeAddonType === "chalet" ? "عقار إضافي" : "خدمة إضافية";
  const listedPrice = activeAddonType === "chalet" ? currentLimits?.extraChaletPrice : currentLimits?.extraServicePrice;
  const numericPrice = listedPrice == null ? null : Number(listedPrice);
  const validPrice = numericPrice !== null && Number.isFinite(numericPrice) && numericPrice >= 0;
  const freeCapacityAvailable = numericPrice === 0 && currentLimits != null &&
    (activeAddonType === "chalet"
      ? currentLimits.chaletCount < currentLimits.chaletLimit
      : currentLimits.serviceCount < currentLimits.serviceLimit);
  const previewQuery = useQuery<AddonPreview>({
    queryKey: ["owner", "subscription-addon-preview", activeAddonType, quantity],
    queryFn: async () => {
      if (quantity == null) throw new Error("أدخل كمية صحيحة لعرض السعر");
      const response = await apiFetch("/owner/subscription/addons/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addonType: activeAddonType, quantity }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر احتساب عرض الإضافة");
      const preview: AddonPreview = {
        addonType: data.addonType == null ? activeAddonType : data.addonType,
        quantity: data.quantity == null ? quantity : Number(data.quantity),
        amountHalala: Number(data.amountHalala),
        monthlyUnitPriceHalala: Number(data.monthlyUnitPriceHalala),
        remainingDays: Number(data.remainingDays),
        cycleDays: Number(data.cycleDays),
        billingDays: Number(data.billingDays),
        periodEndAt: String(data.periodEndAt ?? ""),
        nextBillingAt: typeof data.nextBillingAt === "string" ? data.nextBillingAt : null,
        nextChargeHalala: Number.isSafeInteger(data.nextChargeHalala) ? Number(data.nextChargeHalala) : null,
        baseMonthlyHalala: Number(data.baseMonthlyHalala),
        recurringConfigured: data.recurringConfigured === true,
        canSavePaymentMethod: data.canSavePaymentMethod === true,
      };
      const endDate = new Date(preview.periodEndAt);
      if (preview.addonType !== activeAddonType || preview.quantity !== quantity ||
          !Number.isSafeInteger(preview.amountHalala) || preview.amountHalala < 0 ||
          !Number.isSafeInteger(preview.monthlyUnitPriceHalala) || preview.monthlyUnitPriceHalala < 0 ||
          !Number.isSafeInteger(preview.remainingDays) || preview.remainingDays < 0 ||
          !Number.isSafeInteger(preview.cycleDays) || preview.cycleDays < 1 ||
          !Number.isSafeInteger(preview.billingDays) || preview.billingDays < 1 ||
          Number.isNaN(endDate.getTime()) ||
          !Number.isSafeInteger(preview.baseMonthlyHalala) || preview.baseMonthlyHalala < 0 ||
          (preview.nextChargeHalala != null && (!Number.isSafeInteger(preview.nextChargeHalala) || preview.nextChargeHalala < 0))) {
        throw new Error("استجابة عرض الإضافة غير صالحة");
      }
      return preview;
    },
    enabled: open && !returnAttempt && !returnNotice && quantity != null,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    retry: false,
  });
  const preview = previewQuery.data;
  const previewValid = !!preview && preview.addonType === activeAddonType &&
    preview.quantity === quantity && !previewQuery.isFetching;
  const recurringPreviewValid = previewValid && preview!.amountHalala > 0 &&
    preview!.recurringConfigured && preview!.canSavePaymentMethod &&
    preview!.nextChargeHalala != null &&
    !!preview!.nextBillingAt && !Number.isNaN(new Date(preview!.nextBillingAt).getTime());
  const freePreviewValid = previewValid && preview!.amountHalala === 0;
  const canProceedWithQuote = freePreviewValid || recurringPreviewValid;

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
      if (!previewValid || !preview || requestedQuantity !== preview.quantity ||
          requestedType !== preview.addonType || !canProceedWithQuote ||
          (preview.amountHalala > 0 && !consentToRecurring)) {
        throw new Error("اعرض عرض السعر الكامل وأكد موافقتك قبل بدء الدفع");
      }
      const response = await apiFetch("/owner/subscription/addons/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          addonType: requestedType,
          quantity: requestedQuantity,
          consentToRecurring,
          autoRenewConsent: consentToRecurring,
        }),
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
        nextChargeHalala: Number.isSafeInteger(data.nextChargeHalala) ? Number(data.nextChargeHalala) : undefined,
        nextBillingAt: typeof data.nextBillingAt === "string" ? data.nextBillingAt : null,
        periodEnd: typeof data.periodEnd === "string" ? data.periodEnd :
          typeof data.periodEndAt === "string" ? data.periodEndAt : null,
        periodEndAt: typeof data.periodEndAt === "string" ? data.periodEndAt : null,
        periodStartAt: typeof data.periodStartAt === "string" ? data.periodStartAt : null,
        cycleDays: Number.isSafeInteger(data.cycleDays) ? Number(data.cycleDays) : undefined,
        remainingDays: Number.isFinite(data.remainingDays) ? Number(data.remainingDays) : undefined,
        billingDays: Number.isFinite(data.billingDays) ? Number(data.billingDays) : undefined,
        recurring: data.recurring === true,
        savedPaymentMethodAvailable: data.savedPaymentMethodAvailable === true,
        canSavePaymentMethod: data.canSavePaymentMethod === true,
        recurringConfigured: data.recurringConfigured === true,
        baseMonthlyHalala: Number.isSafeInteger(data.baseMonthlyHalala) ? Number(data.baseMonthlyHalala) : undefined,
      };
      if (!nextQuote.checkoutId || !Number.isSafeInteger(nextQuote.amountHalala) ||
          nextQuote.amountHalala < 0 || nextQuote.addonType !== requestedType ||
          !Number.isSafeInteger(nextQuote.unitPriceHalala) || nextQuote.unitPriceHalala < 0 ||
          nextQuote.quantity !== requestedQuantity) {
        throw new Error("تعذّر التحقق من عرض سعر الإضافة");
      }
      if (nextQuote.amountHalala > 0 && !nextQuote.publishableKey) {
        throw new Error("بوابة الدفع غير مهيأة لإتمام شراء الإضافة");
      }
      if (nextQuote.amountHalala > 0 &&
          (!consentToRecurring || !nextQuote.recurring || !nextQuote.canSavePaymentMethod ||
            nextQuote.nextChargeHalala == null || !nextQuote.nextBillingAt ||
            !nextQuote.periodEnd || nextQuote.remainingDays == null || nextQuote.billingDays == null)) {
        throw new Error("تعذّر تأكيد مبلغ التجديد أو موعده والفترة النسبية أو حفظ وسيلة الدفع؛ لم يبدأ الدفع.");
      }
      return nextQuote;
    },
    onSuccess: (nextQuote) => {
      setError(null);
      if (nextQuote.amountHalala === 0) {
        redeemMutation.mutate({ checkoutId: nextQuote.checkoutId, addonType: nextQuote.addonType, quantity: nextQuote.quantity });
        return;
      }
      const pending = {
        checkoutId: nextQuote.checkoutId,
        addonType: nextQuote.addonType,
        quantity: nextQuote.quantity,
        consentToRecurring,
      };
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
      setQuantityInput("1");
      setConsentToRecurring(false);
      setError(null);
      return;
    }
    setStep("quote");
    setSelectedType(addonType);
    setQuantityInput("1");
    setConsentToRecurring(false);
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
                 سيظهر المبلغ النسبي المستحق الآن ومبلغ وموعد التجديد الكاملين من الخادم قبل طلب موافقتك أو بدء الدفع.
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
                                onClick={() => {
                                  setSelectedType(type);
                                  setConsentToRecurring(false);
                                  setError(null);
                                }}>
                               <span>{type === "chalet" ? "عقارات إضافية" : "خدمات إضافية"}</span>
                                 <span>{isPriceLoading && !currentLimits ? "جارٍ تحميل السعر..." : typePrice == null ? currentLimits?.plan === "trial" ? "لم يُحدّد سعر التجربة بعد" : "غير متاح في خطتك" : `${Number(typePrice).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ⃁ للوحدة / 30 يوماً`}</span>
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
                      <input id="addon-quantity" data-testid="input-addon-quantity" type="text" inputMode="numeric" pattern="[0-9٠-٩۰-۹]*" maxLength={2}
                       value={quantityInput.replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)])} disabled={isBusy}
                       onChange={(event) => {
                         setQuantityInput(normalizeDigits(event.target.value).replace(/\D/g, "").slice(0, 2));
                         setConsentToRecurring(false);
                         setError(null);
                       }}
                       className="mt-1 w-24 rounded-md border border-input bg-background px-3 py-2 text-foreground"
                     />
                       {quantity == null && (
                         <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">أدخل عدداً صحيحاً من 1 إلى 50 لاحتساب عرض السعر.</p>
                       )}
                       {quantity != null && previewQuery.isPending && (
                         <p role="status" className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                           <Loader2 className="h-4 w-4 animate-spin" /> جارٍ جلب عرض السعر الدقيق...
                         </p>
                       )}
                       {previewQuery.isError && quantity != null && (
                         <p role="alert" className="mt-3 text-sm text-destructive">{(previewQuery.error as Error).message}</p>
                       )}
                       {previewValid && preview && (
                       <div className="mt-3 rounded-lg border border-primary/20 bg-background p-3 text-foreground">
                             <p>السعر المرجعي للوحدة لكل 30 يوماً: {(preview.monthlyUnitPriceHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ⃁</p>
                             <p className="mt-2 font-bold">المستحق الآن للفترة المتبقية: {(preview.amountHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ⃁</p>
                             <p className="mt-1 text-xs text-muted-foreground">
                               محسوباً عن {preview.remainingDays} من {preview.billingDays} يوماً حتى نهاية الفترة {new Date(preview.periodEndAt).toLocaleDateString("ar-SA")}.
                             </p>
                             {preview.nextChargeHalala != null && (
                               <p className="mt-2 font-semibold">
                                 {currentLimits?.plan === "trial" ? "رسوم الإضافات المتوقعة للدورة التالية" : `إجمالي الفاتورة الكاملة التالية ${preview.billingDays === 30 ? "شهرياً" : `لكل دورة (${preview.billingDays} يوم)`}`}: {(preview.nextChargeHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ⃁
                               </p>
                             )}
                             {preview.nextBillingAt && (
                               <p className="mt-1 text-xs text-muted-foreground">{currentLimits?.plan === "trial" ? "تنتهي التجربة في" : "موعد التجديد التالي"}: {new Date(preview.nextBillingAt).toLocaleDateString("ar-SA")}</p>
                             )}
                             {currentLimits?.plan === "trial" ? (
                               <p className="mt-1 text-xs text-muted-foreground">لا تُخصم رسوم تجديد عند نهاية التجربة تلقائياً. اختر باقة مدفوعة أولاً؛ سيضاف سعرها إلى رسوم الإضافات في فاتورة واحدة قبل الدفع.</p>
                             ) : (
                               <p className="mt-1 text-xs text-muted-foreground">الاشتراك الأساسي المرجعي لكل 30 يوماً: {(preview.baseMonthlyHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ⃁</p>
                             )}
                           {preview.amountHalala > 0 && recurringPreviewValid && (
                            <label className="mt-3 flex items-start gap-2 text-sm">
                              <input
                                type="checkbox"
                                data-testid="checkbox-addon-recurring-consent"
                                checked={consentToRecurring}
                                 disabled={isBusy || previewQuery.isFetching}
                                onChange={(event) => setConsentToRecurring(event.target.checked)}
                                className="mt-1"
                              />
                              <span>
                                 {currentLimits?.plan === "trial"
                                   ? `أوافق على حفظ وسيلة الدفع لتجديد الإضافات بمبلغ ${(preview.nextChargeHalala! / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ⃁ لكل دورة بعد اختياري باقة مدفوعة؛ سيُعرض سعر الباقة والإجمالي قبل الدفع، ولن يُخصم تجديد عند نهاية التجربة تلقائياً.`
                                   : `أوافق صراحةً على حفظ وسيلة الدفع وتجديد الإضافة مع الاشتراك الأساسي بإجمالي ${(preview.nextChargeHalala! / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ⃁ ${preview.billingDays === 30 ? "شهرياً" : `لكل دورة (${preview.billingDays} يوم)`} في موعد التجديد الموضح أعلاه.`}
                              </span>
                            </label>
                          )}
                           {preview.amountHalala > 0 && !recurringPreviewValid && (
                             <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">التجديد أو حفظ وسيلة الدفع غير مهيأ؛ لن يبدأ الدفع أو يُطلب منك الموافقة.</p>
                           )}
                       </div>
                    )}
                       {!validPrice && !isPriceLoading && (
                         <p className="mt-2 text-xs">{isPriceError ? "تعذّر تحميل سعر الإضافة." : currentLimits?.plan === "trial" ? "لم يحدّد المشرف سعر هذه الإضافة أثناء التجربة المجانية بعد." : "هذه الإضافة غير متاحة للشراء في خطتك الحالية."}</p>
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
                     <Button
                       data-testid="button-request-addon-quote"
                       className="flex-1 gap-2"
                       onClick={() => quantity != null && quoteMutation.mutate({ quantity, addonType: activeAddonType })}
                       disabled={isBusy || previewQuery.isFetching || !quantity || !previewValid || !canProceedWithQuote ||
                         freeCapacityAvailable || (!!preview && preview.amountHalala > 0 && !consentToRecurring)}
                     >
                    {quoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                       {previewValid && preview?.amountHalala === 0 ? "تفعيل الإضافات مجاناً" : "المتابعة إلى الدفع"}
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