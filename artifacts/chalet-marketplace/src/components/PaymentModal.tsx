import { formatDateWithHijri } from "@/lib/hijri";
import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Crown, CheckCircle2, Download, Loader2, AlertTriangle, CreditCard,
  Calendar, ShieldCheck, Star, Building2, Package, Zap, Wallet,
} from "lucide-react";
import { useOwnerWallet, useOwnerId, WALLET_KEY } from "@/features/photography/walletPanel";
import { walletCall, isUncertain, useSubWalletMarker } from "@/features/photography/walletOps";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { credentials: "include", ...opts });
}

/* ── Plan types ── */
interface Plan {
  id: string;
  label: string;
  price: number;
  days: number;
  scope?: "property" | "full" | null;
  chaletLimit?: number | null;
  serviceLimit?: number | null;
  trialDays?: number;
  features?: string[];
  recurringConfigured?: boolean;
  canSavePaymentMethod?: boolean;
}

interface PendingSubscriptionCheckout {
  checkoutId: string;
  plan: string;
  consentToRecurring?: boolean;
}

const PENDING_SUBSCRIPTION_KEY = "subscription-payment-pending:v1";

function readPendingSubscriptionCheckout(): PendingSubscriptionCheckout | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_SUBSCRIPTION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value?.checkoutId !== "string" || !value.checkoutId ||
        typeof value?.plan !== "string" || !value.plan) return null;
    return {
      checkoutId: value.checkoutId,
      plan: value.plan,
      consentToRecurring: value.consentToRecurring === true,
    };
  } catch {
    return null;
  }
}

function savePendingSubscriptionCheckout(checkout: PendingSubscriptionCheckout): boolean {
  try {
    window.sessionStorage.setItem(PENDING_SUBSCRIPTION_KEY, JSON.stringify(checkout));
    return true;
  } catch {
    return false;
  }
}

function clearPendingSubscriptionCheckout(checkoutId: string) {
  try {
    if (readPendingSubscriptionCheckout()?.checkoutId === checkoutId) {
      window.sessionStorage.removeItem(PENDING_SUBSCRIPTION_KEY);
    }
  } catch {
    // The server confirmation remains successful if browser storage is unavailable.
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

const PLAN_ICONS: Record<string, React.ReactNode> = {
  monthly:          <Package className="w-5 h-5 text-indigo-500" />,
  yearly:           <Crown className="w-5 h-5 text-amber-500" />,
  chalet_basic:     <Building2 className="w-5 h-5 text-green-500" />,
  chalet_pro:       <Zap className="w-5 h-5 text-violet-500" />,
  chalet_unlimited: <Crown className="w-5 h-5 text-rose-500" />,
  service_basic:    <Star className="w-5 h-5 text-teal-500" />,
  service_pro:      <Zap className="w-5 h-5 text-cyan-500" />,
  bundle:           <Crown className="w-5 h-5 text-orange-500" />,
};

const POPULAR_PLANS = ["monthly", "yearly"];

interface Invoice {
  paymentId: string;
  plan: string;
  label: string;
  amount: number;
  currency: string;
  paidAt: string;
  expiresAt: string;
  ownerName: string;
  lines?: Array<{ description?: string; label?: string; quantity?: number; amount?: number; amountHalala?: number }>;
  lineItems?: Array<{ description?: string; label?: string; quantity?: number; amount?: number; amountHalala?: number }>;
  nextChargeHalala?: number;
  nextBillingAt?: string | null;
  periodEnd?: string | null;
  recurring?: boolean;
  cycleDays?: number;
}

interface CheckoutLine {
  description?: string;
  label?: string;
  quantity?: number;
  amountHalala?: number;
  amount?: number;
}

interface PlanQuote {
  checkoutId?: string;
  amountHalala: number;
  discountHalala: number;
  label: string;
  days: number;
  lines: CheckoutLine[];
  nextChargeHalala?: number;
  nextBillingAt?: string | null;
  periodEnd?: string | null;
  recurring?: boolean;
  recurringPreview?: boolean;
  recurringConfigured?: boolean;
  canSavePaymentMethod?: boolean;
  promoCode: string;
}

function normalizePlanQuote(data: any, fallbackPlan: Plan, promoCode: string, isPreview = false): PlanQuote {
  const lines = Array.isArray(data.lines) ? data.lines
    : Array.isArray(data.lineItems) ? data.lineItems : [];
  return {
    ...(typeof data.checkoutId === "string" ? { checkoutId: data.checkoutId } : {}),
    amountHalala: Number(data.amountHalala),
    discountHalala: Number(data.discountHalala ?? 0),
    label: String(data.label ?? fallbackPlan.label),
    days: Number(data.days ?? fallbackPlan.days),
    lines,
    nextChargeHalala: Number.isSafeInteger(data.nextChargeHalala) ? Number(data.nextChargeHalala) : undefined,
    nextBillingAt: typeof data.nextBillingAt === "string" ? data.nextBillingAt : null,
    periodEnd: typeof data.periodEnd === "string" ? data.periodEnd : null,
    recurring: data.recurring === true,
    recurringPreview: isPreview || data.recurringPreview === true || data.recurring === true,
    recurringConfigured: data.recurringConfigured === true,
    canSavePaymentMethod: data.canSavePaymentMethod === true,
    promoCode,
  };
}

function comparablePlanQuote(quote: PlanQuote) {
  return {
    amountHalala: quote.amountHalala,
    discountHalala: quote.discountHalala,
    label: quote.label,
    days: quote.days,
    lines: quote.lines.map((line) => ({
      label: line.label ?? line.description ?? "",
      quantity: line.quantity ?? 1,
      amountHalala: line.amountHalala ?? (line.amount != null ? Math.round(line.amount * 100) : null),
    })),
    nextChargeHalala: quote.nextChargeHalala ?? null,
    nextBillingAt: quote.nextBillingAt ? formatDateWithHijri(quote.nextBillingAt) : null,
    periodEnd: quote.periodEnd ? formatDateWithHijri(quote.periodEnd) : null,
    recurringConfigured: quote.recurringConfigured === true,
    canSavePaymentMethod: quote.canSavePaymentMethod === true,
  };
}

/* ── Invoice PDF generator (pure JS / canvas) ── */
function downloadInvoice(inv: Invoice) {
  const lines = [
    `فاتورة إلكترونية — حكاية أناقة`,
    ``,
    `رقم الدفعة: ${inv.paymentId}`,
    `الاسم: ${inv.ownerName}`,
    `الخطة: ${inv.label}`,
    ...(inv.lines ?? inv.lineItems ?? []).map((line) => {
      const description = line.description ?? line.label ?? "بند الاشتراك";
      const amount = line.amountHalala != null
        ? `${(line.amountHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${inv.currency}`
        : line.amount != null ? `${line.amount} ${inv.currency}` : "";
      return `${line.quantity && line.quantity > 1 ? `${line.quantity} × ` : ""}${description}${amount ? `: ${amount}` : ""}`;
    }),
    `المبلغ: ${inv.amount} ${inv.currency}`,
    ...(inv.recurring && inv.nextChargeHalala != null
      ? [`رسوم ${inv.cycleDays === 30 ? "الدورة الشهرية" : `الدورة (${inv.cycleDays ?? "—"} يوم)`} التالية: ${(inv.nextChargeHalala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2 })} ${inv.currency}`]
      : []),
    ...(inv.nextBillingAt ? [`موعد التجديد التالي: ${formatDateWithHijri(inv.nextBillingAt)}`] : []),
    `تاريخ الدفع: ${formatDateWithHijri(inv.paidAt)}`,
    `صالح حتى: ${formatDateWithHijri(inv.expiresAt)}`,
    ``,
    `شكراً لاشتراكك في منصة حكاية أناقة`,
  ];

  const canvas = document.createElement("canvas");
  canvas.width = 680;
  canvas.height = 420;
  const ctx = canvas.getContext("2d")!;

  ctx.fillStyle = "#f9f5f1";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#b5895a";
  ctx.fillRect(0, 0, canvas.width, 10);
  ctx.fillRect(0, canvas.height - 10, canvas.width, 10);

  ctx.font = "bold 22px serif";
  ctx.fillStyle = "#3b2a1a";
  ctx.textAlign = "center";
  ctx.fillText("فاتورة إلكترونية — حكاية أناقة", canvas.width / 2, 50);

  ctx.font = "16px serif";
  ctx.textAlign = "right";
  lines.slice(2).forEach((line, i) => {
    ctx.fillStyle = line.startsWith("ر") || line.startsWith("ا") || line.startsWith("خ") || line.startsWith("م") || line.startsWith("ت") || line.startsWith("ص") ? "#222" : "#555";
    ctx.fillText(line, canvas.width - 40, 100 + i * 28);
  });

  ctx.font = "13px serif";
  ctx.fillStyle = "#999";
  ctx.textAlign = "center";
  ctx.fillText("شكراً لاشتراكك في منصة حكاية أناقة", canvas.width / 2, canvas.height - 30);

  const link = document.createElement("a");
  link.download = `invoice-${inv.paymentId.slice(0, 8)}.png`;
  link.href = canvas.toDataURL("image/png");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/* ── Moyasar script loader ── */
function useMoyasarScript() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if ((window as any).Moyasar) { setReady(true); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://cdn.moyasar.com/mpf/1.14.0/moyasar.js";
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);
  return ready;
}

/* ── Main Modal ── */
interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  currentPlan?: string;
}

type Step = "plan" | "pay" | "success";

export function PaymentModal({ open, onClose, currentPlan }: PaymentModalProps) {
  const qc = useQueryClient();
  const scriptReady = useMoyasarScript();
  const formContainerRef = useRef<HTMLDivElement>(null);
  const moyasarInstance = useRef<any>(null);

  const [step, setStep] = useState<Step>("plan");
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [initiateData, setInitiateData] = useState<{
    checkoutId: string;
    publishableKey: string;
    amountHalala: number;
    discountHalala: number;
    label: string;
    days: number;
    lines?: CheckoutLine[];
    nextChargeHalala?: number;
    nextBillingAt?: string | null;
    periodEnd?: string | null;
    recurring?: boolean;
    canSavePaymentMethod?: boolean;
    consentToRecurring: boolean;
  } | null>(null);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const [consentToRecurring, setConsentToRecurring] = useState(false);
  const [planQuote, setPlanQuote] = useState<PlanQuote | null>(null);
  const [planQuoteLoading, setPlanQuoteLoading] = useState(false);
  const [planPreviewRevision, setPlanPreviewRevision] = useState(0);
  const [activationWithoutSavedCard, setActivationWithoutSavedCard] = useState(false);
  const [pendingCheckout, setPendingCheckout] = useState<PendingSubscriptionCheckout | null>(() => readPendingSubscriptionCheckout());
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnPaymentId, setReturnPaymentId] = useState<string | null>(null);
  const [returnPaymentStatus, setReturnPaymentStatus] = useState<string | null>(null);
  const [returnNotice, setReturnNotice] = useState<string | null>(null);
  const handledReturnRef = useRef<string | null>(null);
  const [paidByWallet, setPaidByWallet] = useState(false);
  const walletLock = useRef(false);
  const wallet = useOwnerWallet(open);
  const ownerId = useOwnerId();
  const walletMarker = useSubWalletMarker(ownerId);
  const walletPending = walletMarker.value;
  const walletMarkerRef = useRef(walletMarker);
  walletMarkerRef.current = walletMarker;
  const [walletUncertain, setWalletUncertain] = useState(false);
  useEffect(() => { if (open) walletMarkerRef.current.refresh(); }, [open, ownerId]);

  /* Load plans */
  useEffect(() => {
    if (!open && !returnDialogOpen) return;
    apiFetch("/owner/plans").then(r => r.json()).then(setPlans).catch(() => {});
  }, [open, returnDialogOpen]);

  /* Reset on close */
  useEffect(() => {
    if (!open) {
      setStep("plan");
      setSelectedPlan(null);
      setInitiateData(null);
      setInvoice(null);
      setPayError(null);
      setPaying(false);
      setPromoCode("");
      setConsentToRecurring(false);
      setPlanQuote(null);
      setPlanQuoteLoading(false);
      setActivationWithoutSavedCard(false);
      setPaidByWallet(false);
      moyasarInstance.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open || !selectedPlan) {
      setPlanQuoteLoading(false);
      return;
    }
    let active = true;
    const requestedPlan = selectedPlan;
    const requestedPromoCode = promoCode.trim();
    setPlanQuoteLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await apiFetch("/owner/subscription/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: requestedPlan.id,
            ...(requestedPromoCode ? { promoCode: requestedPromoCode } : {}),
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "تعذّر تحميل عرض الخطة");
        const quote = normalizePlanQuote(data, requestedPlan, requestedPromoCode, true);
        if (!Number.isSafeInteger(quote.amountHalala) || quote.amountHalala < 0 ||
            !Number.isSafeInteger(quote.discountHalala) || quote.discountHalala < 0 ||
            !Number.isSafeInteger(quote.days) || quote.days < 1 ||
            !quote.lines.every((line) => line.amountHalala == null || Number.isSafeInteger(line.amountHalala))) {
          throw new Error("استجابة عرض الخطة غير صالحة");
        }
        if (active) {
          setPlanQuote(quote);
          setPayError(null);
        }
      } catch (cause) {
        if (active) {
          setPlanQuote(null);
          setPayError(cause instanceof Error ? cause.message : "تعذّر تحميل عرض الخطة");
        }
      } finally {
        if (active) setPlanQuoteLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, selectedPlan, promoCode, planPreviewRevision]);

  /* Confirm payment mutation */
  const confirmMutation = useMutation({
    mutationFn: async ({ paymentId, checkoutId }: { paymentId: string; checkoutId: string; isRedirectReturn?: boolean }) => {
      const r = await apiFetch("/owner/subscription/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, checkoutId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "فشل تأكيد الدفع");
      return data as { subscription: any; invoice: Invoice };
    },
    onSuccess: (data, variables) => {
      clearPendingSubscriptionCheckout(variables.checkoutId);
      setPendingCheckout((current) => current?.checkoutId === variables.checkoutId ? null : current);
      setInvoice({
        ...data.invoice,
        cycleDays: Number(data.subscription?.billingCycleDays ?? data.invoice.cycleDays ?? selectedPlan?.days ?? 30),
      });
      setStep("success");
      setPaying(false);
      setPayError(null);
      if (variables.isRedirectReturn) {
        clearPaymentReturnParams();
        setReturnPaymentId(null);
        setReturnPaymentStatus(null);
        setReturnNotice(null);
        setReturnDialogOpen(true);
        handledReturnRef.current = null;
      }
      qc.invalidateQueries({ queryKey: ["owner", "subscription"] });
      qc.invalidateQueries({ queryKey: ["owner", "subscription-header"] });
      qc.invalidateQueries({ queryKey: ["owner", "plan-limits"] });
    },
    onError: (err: Error) => {
      setPayError(err.message);
      setPaying(false);
    },
  });

  const redeemMutation = useMutation({
    mutationFn: async ({ checkoutId }: { checkoutId: string }) => {
      const r = await apiFetch("/owner/subscription/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "تعذّر تفعيل العرض المجاني");
      return data as { subscription: any; invoice: Invoice };
    },
    onSuccess: (data) => {
      setInvoice({
        ...data.invoice,
        cycleDays: Number(data.subscription?.billingCycleDays ?? data.invoice.cycleDays ?? selectedPlan?.days ?? 30),
      });
      setStep("success");
      setPaying(false);
      qc.invalidateQueries({ queryKey: ["owner", "subscription"] });
      qc.invalidateQueries({ queryKey: ["owner", "subscription-header"] });
      qc.invalidateQueries({ queryKey: ["owner", "plan-limits"] });
    },
    onError: (err: Error) => {
      setPayError(err.message);
      setPaying(false);
    },
  });

  /* Wallet: full-balance payment of the server checkout; no card, no recurring consent. */
  const walletPayMutation = useMutation({
    mutationFn: ({ checkoutId }: { checkoutId: string }) =>
      walletCall<{ subscription: any; invoice: Invoice }>(`${BASE}/api/owner/subscription/wallet-pay`, { checkoutId }),
    onSuccess: (data, variables) => {
      if (walletMarkerRef.current.value?.checkoutId === variables.checkoutId) walletMarkerRef.current.clear();
      setWalletUncertain(false);
      setInvoice({
        ...data.invoice,
        cycleDays: Number(data.subscription?.billingCycleDays ?? data.invoice.cycleDays ?? selectedPlan?.days ?? 30),
      });
      setPaidByWallet(true);
      setStep("success");
      setPaying(false);
      setPayError(null);
      qc.invalidateQueries({ queryKey: ["owner", "subscription"] });
      qc.invalidateQueries({ queryKey: ["owner", "subscription-header"] });
      qc.invalidateQueries({ queryKey: ["owner", "plan-limits"] });
    },
    onError: (err: Error, variables) => {
      if (isUncertain(err)) {
        // Unknown outcome: keep the SAME checkout for verification, never start a new one.
        setWalletUncertain(true);
        setPayError(`لم نتمكن من التأكد من نتيجة الدفع من المحفظة (${err.message}). لا تعِد الدفع؛ استخدم «التحقق من عملية المحفظة» لإكمال العملية نفسها.`);
      } else {
        if (walletMarkerRef.current.value?.checkoutId === variables.checkoutId) walletMarkerRef.current.clear();
        setWalletUncertain(false);
        setPayError(`رفض الخادم الدفع من المحفظة ولم يُخصم أي مبلغ: ${err.message}`);
      }
      setPaying(false);
    },
    onSettled: () => {
      walletLock.current = false;
      qc.invalidateQueries({ queryKey: WALLET_KEY });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("checkout_flow") && params.get("checkout_flow") !== "subscription") return;
    const paymentId = params.get("id") || params.get("payment_id") || params.get("paymentId");
    const status = params.get("status") || params.get("payment_status") || params.get("paymentStatus");
    if (!paymentId && !status) return;

    const pending = readPendingSubscriptionCheckout();
    if (!pending) return;

    const returnKey = `${paymentId ?? ""}:${status ?? ""}:${pending.checkoutId}`;
    if (handledReturnRef.current === returnKey) return;
    handledReturnRef.current = returnKey;
    setPendingCheckout(pending);
    setReturnDialogOpen(true);
    setStep("plan");
    setPayError(null);

    if (!paymentId) {
      setReturnPaymentStatus(status);
      setReturnNotice(status
        ? `عادت بوابة الدفع بالحالة «${status}» دون رقم عملية دفع؛ لم نبدأ عملية اشتراك أخرى.`
        : "لم يتضمن رابط العودة رقم عملية دفع؛ الاشتراك المحفوظ لم يُحذف.");
      setPayError("تعذّر تأكيد الدفع دون رقم العملية. أعد فتح رابط العودة بعد التحقق من الدفع.");
      return;
    }

    setReturnPaymentId(paymentId);
    setReturnPaymentStatus(status);
    setReturnNotice(status
      ? `عادت بوابة الدفع بالحالة «${status}»؛ جارٍ التحقق من الدفع مع الخادم.`
      : "جارٍ التحقق من نتيجة الدفع مع الخادم...");
    setPaying(true);
    confirmMutation.mutate({ paymentId, checkoutId: pending.checkoutId, isRedirectReturn: true });
  }, []);

  /* Mount Moyasar form when we enter pay step */
  useEffect(() => {
    if (step !== "pay" || !scriptReady || !initiateData || !formContainerRef.current) return;
    const Moyasar = (window as any).Moyasar;
    if (!Moyasar) return;

    const container = formContainerRef.current;
    container.innerHTML = ""; // clear any previous instance

    moyasarInstance.current = Moyasar.init({
      element: container,
      amount: initiateData.amountHalala,
      currency: "SAR",
      description: `${initiateData.label} — حكاية أناقة [${initiateData.checkoutId}]`,
      publishable_api_key: initiateData.publishableKey,
      callback_url: (() => {
        const url = new URL(window.location.href);
        url.searchParams.set("checkout_flow", "subscription");
        return url.toString();
      })(), // redirects are verified against the saved intent on return
      on_completed: (payment: any) => {
        if (payment.status === "paid") {
          setPaying(true);
          confirmMutation.mutate({
            paymentId: payment.id,
            checkoutId: initiateData.checkoutId,
            isRedirectReturn: false,
          });
        } else {
          setPayError(`لم يكتمل الدفع — الحالة: ${payment.status}`);
        }
        return false; // prevent default redirect
      },
      supported_networks: initiateData.consentToRecurring
        ? ["mada", "visaMastercard"]
        : ["mada", "visaMastercard", "stcpay", "applepay"],
      ...(initiateData.consentToRecurring ? { credit_card: { save_card: true } } : {}),
      language: "ar",
    });

    return () => {
      container.innerHTML = "";
      moyasarInstance.current = null;
    };
  }, [step, scriptReady, initiateData]);

  /* Step 1: Select a plan */
  function handleSelectPlan(p: Plan) {
    if (walletMarkerRef.current.value) return;
    setSelectedPlan(p);
    setConsentToRecurring(false);
    setPlanQuote(null);
    setPayError(null);
    setActivationWithoutSavedCard(false);
    setPlanQuoteLoading(true);
    setPlanPreviewRevision((revision) => revision + 1);
  }

  async function handleContinueWithPlan() {
    const p = selectedPlan;
    if (!p) return;
    if (planQuoteLoading || !planQuote || planQuote.promoCode !== promoCode.trim()) {
      setPayError("انتظر حتى يكتمل عرض السعر الحالي قبل المتابعة.");
      return;
    }
    if (p.price > 0 && (!planQuote.recurringPreview ||
        !planQuote.recurringConfigured || !planQuote.canSavePaymentMethod ||
        planQuote.nextChargeHalala == null || !planQuote.nextBillingAt)) {
      setPayError("لم يؤكد الخادم مبلغ الفاتورة التالية أو موعدها أو إمكانية حفظ وسيلة الدفع؛ لم يبدأ الدفع.");
      return;
    }
    if (p.price > 0 && !consentToRecurring) {
      setPayError(`للمتابعة إلى دفع دورة التجديد (${planQuote?.days ?? p.days} يوم)، يجب تأكيد موافقتك الصريحة أولاً.`);
      return;
    }
    if (walletMarkerRef.current.value) {
      setPayError("توجد عملية دفع من المحفظة قيد التحقق؛ لن نبدأ دفعاً بالبطاقة قبل حسمها.");
      return;
    }
    const existingPending = readPendingSubscriptionCheckout();
    if (existingPending) {
      setPendingCheckout(existingPending);
      setPayError("توجد عملية اشتراك سابقة قيد التأكيد؛ لن نبدأ عملية دفع جديدة قبل حسمها.");
      setConsentToRecurring(false);
      return;
    }
    setSelectedPlan(p);
    setPayError(null);
    setPaying(true);
    try {
      const r = await apiFetch("/owner/subscription/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: p.id,
          autoRenewConsent: p.price > 0 && consentToRecurring,
          ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setPayError(data.error ?? "تعذّر التحقق من رمز الخصم");
        setConsentToRecurring(false);
        setInitiateData(null);
        return;
      }
      const finalQuote = normalizePlanQuote(data, p, promoCode.trim());
      const quote = {
        ...finalQuote,
        checkoutId: String(data.checkoutId ?? ""),
        publishableKey: data.publishableKey as string,
      };
      if (!quote.checkoutId || !Number.isSafeInteger(quote.amountHalala) || quote.amountHalala < 0) {
        setPayError("تعذّر إعداد مبلغ الدفع. حاول مرة أخرى.");
        setConsentToRecurring(false);
        setInitiateData(null);
        return;
      }
      if (JSON.stringify(comparablePlanQuote(planQuote)) !== JSON.stringify(comparablePlanQuote(finalQuote))) {
        setPlanQuote({ ...finalQuote, checkoutId: undefined });
        setConsentToRecurring(false);
        setInitiateData(null);
        setPayError("تغيّر السعر أو بنود الفاتورة أو موعدها أثناء التأكيد. راجع العرض المحدّث وأكد موافقتك مجدداً قبل المتابعة.");
        return;
      }
      if (quote.amountHalala === 0) {
        setActivationWithoutSavedCard(true);
        setConsentToRecurring(false);
        redeemMutation.mutate({ checkoutId: quote.checkoutId });
        return;
      }
      if (!quote.recurring || !data.recurringConfigured || !quote.canSavePaymentMethod ||
          quote.nextChargeHalala == null || !quote.nextBillingAt) {
        setPayError("تعذّر تأكيد مبلغ التجديد وموعده أو حفظ وسيلة الدفع؛ لم يبدأ الدفع.");
        setConsentToRecurring(false);
        return;
      }
      setInitiateData({ ...quote, consentToRecurring });
      const pending = { checkoutId: quote.checkoutId, plan: p.id, consentToRecurring };
      if (!savePendingSubscriptionCheckout(pending)) {
        setInitiateData(null);
        setConsentToRecurring(false);
        setPayError("تعذّر حفظ عملية الاشتراك بأمان في هذه الجلسة؛ لم يبدأ الدفع. يرجى تفعيل التخزين المؤقت أو المحاولة من متصفح آخر.");
        return;
      }
      setPendingCheckout(pending);
      setStep("pay");
    } catch {
      setPayError("تعذّر الاتصال بخدمة الدفع. حاول مرة أخرى.");
      setConsentToRecurring(false);
      setInitiateData(null);
      setPendingCheckout(null);
    } finally {
      setPaying(false);
    }
  }

  function resumeWalletPay() {
    const m = walletMarkerRef.current.value;
    if (!m || walletLock.current || walletPayMutation.isPending) return;
    walletLock.current = true;
    setPayError(null);
    setPaying(true);
    walletPayMutation.mutate({ checkoutId: m.checkoutId });
  }

  async function handleWalletPay() {
    const p = selectedPlan;
    if (!p || walletLock.current || paying || walletPayMutation.isPending) return;
    if (!ownerId) { setPayError("تعذّر التحقق من هوية الحساب؛ أعد تحميل الصفحة."); return; }
    if (walletMarkerRef.current.value) { setPayError("توجد عملية دفع من المحفظة قيد التحقق؛ أكملها أولاً."); return; }
    if (planQuoteLoading || !planQuote || planQuote.promoCode !== promoCode.trim()) {
      setPayError("انتظر حتى يكتمل عرض السعر الحالي قبل المتابعة.");
      return;
    }
    const balance = wallet.data?.balanceHalalas;
    if (balance == null || balance < planQuote.amountHalala) {
      setPayError("رصيد المحفظة لا يغطي كامل المبلغ المستحق؛ لا يمكن الجمع بين المحفظة والبطاقة.");
      return;
    }
    if (readPendingSubscriptionCheckout()) {
      setPendingCheckout(readPendingSubscriptionCheckout());
      setPayError("توجد عملية اشتراك سابقة قيد التأكيد؛ لن نبدأ عملية دفع جديدة قبل حسمها.");
      return;
    }
    walletLock.current = true;
    setPayError(null);
    setPaying(true);
    setConsentToRecurring(false);
    try {
      const r = await apiFetch("/owner/subscription/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: p.id,
          autoRenewConsent: false,
          paymentMethod: "wallet",
          ...(promoCode.trim() ? { promoCode: promoCode.trim() } : {}),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "تعذّر إعداد الدفع من المحفظة");
      const finalQuote = normalizePlanQuote(data, p, promoCode.trim());
      const checkoutId = String(data.checkoutId ?? "");
      if (!checkoutId || !Number.isSafeInteger(finalQuote.amountHalala) || finalQuote.amountHalala < 0) {
        throw new Error("تعذّر إعداد مبلغ الدفع. حاول مرة أخرى.");
      }
      if (finalQuote.amountHalala !== planQuote.amountHalala || finalQuote.discountHalala !== planQuote.discountHalala || finalQuote.days !== planQuote.days) {
        setPlanQuote({ ...finalQuote, checkoutId: undefined });
        throw new Error("تغيّر المبلغ المستحق أثناء التأكيد. راجع العرض المحدّث ثم أعد المحاولة.");
      }
      if (finalQuote.amountHalala > balance) {
        throw new Error("رصيد المحفظة لا يغطي كامل المبلغ المستحق.");
      }
      // Persist BEFORE sending so a lost response can be resumed with this exact checkout.
      if (!walletMarkerRef.current.save({ checkoutId, plan: p.id, amountHalala: finalQuote.amountHalala, createdAt: new Date().toISOString() })) {
        throw new Error("تعذّر حفظ مرجع العملية في المتصفح؛ لم يُرسل طلب الدفع حفاظاً على أموالك.");
      }
      walletPayMutation.mutate({ checkoutId });
    } catch (cause) {
      walletLock.current = false;
      setPaying(false);
      setPayError(cause instanceof Error ? cause.message : "تعذّر الاتصال بخدمة الدفع.");
    }
  }

  const formatPrice = (halala: number) =>
    `${(halala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ⃁`;
  const cycleLabel = (days: number) => days === 30 ? "شهرياً" : `لكل دورة (${days} يوم)`;
  const selectedRecurringReady = !!planQuote && planQuote.recurringPreview === true &&
    planQuote.recurringConfigured === true && planQuote.canSavePaymentMethod === true &&
    planQuote.nextChargeHalala != null && !!planQuote.nextBillingAt &&
    planQuote.promoCode === promoCode.trim() && !planQuoteLoading;

  const closeModal = () => {
    if (paying || confirmMutation.isPending || redeemMutation.isPending || walletPayMutation.isPending) return;
    setReturnDialogOpen(false);
    onClose();
  };

  const retryPendingConfirmation = () => {
    if (!pendingCheckout || !returnPaymentId || paying) return;
    setPayError(null);
    setReturnNotice(returnPaymentStatus
      ? `جارٍ إعادة التحقق من نتيجة الدفع «${returnPaymentStatus}» مع الخادم...`
      : "جارٍ إعادة التحقق من نتيجة الدفع مع الخادم...");
    setPaying(true);
    confirmMutation.mutate({
      checkoutId: pendingCheckout.checkoutId,
      paymentId: returnPaymentId,
      isRedirectReturn: true,
    });
  };

  /* ─── UI ─── */
  return (
    <Dialog open={open || returnDialogOpen} onOpenChange={(o) => { if (!o) closeModal(); }}>
      <DialogContent
        className="max-w-lg rounded-3xl p-0 flex flex-col overflow-hidden"
        dir="rtl"
        style={{ fontFamily: "'Saudi Riyal Symbol', inherit", top: '50px', transform: 'translateX(-50%)', maxHeight: 'calc(100dvh - 70px)' }}
      >

        {/* ── Step: Plan Selection ── */}
        {step === "plan" && (
          <>
            <DialogHeader className="p-6 pb-2 bg-gradient-to-br from-primary/10 to-background shrink-0">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <Crown className="w-5 h-5 text-primary" />
                اختر خطتك
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                اشتراك بدون عمولة — سعر ثابت فقط
              </DialogDescription>
            </DialogHeader>
             <div className="p-5 grid gap-2 overflow-y-auto flex-1" style={{ paddingBottom: '100px' }}>
              {walletPending && (
                <div className="rounded-xl border border-[#8C6246]/40 bg-[#8C6246]/5 p-3 text-sm" data-testid="notice-wallet-pending">
                  <p className="font-semibold">عملية دفع اشتراك من المحفظة بانتظار التأكيد</p>
                  <p className="mt-1 text-muted-foreground">
                    الخطة: {walletPending.plan} — المبلغ: {formatPrice(walletPending.amountHalala)}. {walletUncertain || !walletPayMutation.isPending ? "قد يكون المبلغ خُصم بالفعل. التحقق يعيد إرسال العملية نفسها فقط ولن يخصم مرتين." : ""}
                  </p>
                  <Button
                    className="mt-3 w-full bg-[#8C6246] hover:bg-[#734f36] text-white"
                    onClick={resumeWalletPay}
                    disabled={walletPayMutation.isPending || paying}
                    data-testid="button-wallet-resume"
                  >
                    {walletPayMutation.isPending ? "جارٍ التحقق..." : "التحقق من عملية المحفظة وإكمالها"}
                  </Button>
                </div>
              )}
              {pendingCheckout && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-semibold">توجد عملية اشتراك محفوظة قيد التأكيد</p>
                  <p className="mt-1">
                    {returnNotice ?? `الخطة المرتبطة بالعملية: ${pendingCheckout.plan}. لن نبدأ دفعاً جديداً أو نحذفها قبل تأكيد الخادم.`}
                  </p>
                  {returnPaymentStatus && (
                    <p className="mt-1 text-xs">الحالة الواردة من بوابة الدفع: {returnPaymentStatus}</p>
                  )}
                  {returnPaymentId && (
                    <Button
                      className="mt-3 w-full"
                      variant="outline"
                      onClick={retryPendingConfirmation}
                      disabled={paying || confirmMutation.isPending}
                    >
                      إعادة التحقق من الدفع
                    </Button>
                  )}
                </div>
              )}
              <label className="text-sm font-medium text-foreground" htmlFor="subscription-promo-code">
                رمز الخصم (اختياري)
              </label>
              <input
                id="subscription-promo-code"
                data-testid="input-subscription-promo-code"
                value={promoCode}
                onChange={(event) => {
                  setPromoCode(event.target.value);
                  setPlanQuote(null);
                  setConsentToRecurring(false);
                  setPayError(null);
                  if (selectedPlan) setPlanQuoteLoading(true);
                }}
                placeholder="أدخل رمز الخصم"
                autoComplete="off"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm"
                disabled={paying}
              />
              {paying && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  جارٍ التحقق من الباقة ورمز الخصم...
                </div>
              )}
              {plans.length === 0 && (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              )}
              {plans.map((p) => {
                const isPopular = POPULAR_PLANS.includes(p.id);
                const isCurrent = p.id === currentPlan;
                const accessDescription = p.features?.length
                  ? p.features.slice(0, 3).join(" · ")
                  : p.scope === "property"
                    ? "إدارة العقارات فقط"
                    : "إدارة العقارات والمالية والإدارة";
                return (
                  <button
                    key={p.id}
                    onClick={() => !paying && !planQuoteLoading && !redeemMutation.isPending && !pendingCheckout && !walletPending && handleSelectPlan(p)}
                    disabled={paying || planQuoteLoading || redeemMutation.isPending || !!pendingCheckout}
                    className={`w-full text-start rounded-2xl border-2 p-4 flex items-center gap-3 transition-all cursor-pointer hover:border-primary/70 hover:bg-primary/5 disabled:opacity-60 disabled:cursor-default ${
                      isCurrent ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <div className="shrink-0">{PLAN_ICONS[p.id] ?? <Package className="w-5 h-5" />}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground text-sm">{p.label}</span>
                        {isPopular && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">الأكثر شعبية</span>
                        )}
                        {isCurrent && (
                          <span className="text-[10px] font-bold bg-primary/20 text-primary px-2 py-0.5 rounded-full">خطتك الحالية</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.days} يوم</p>
                      {accessDescription && <p className="text-xs text-muted-foreground mt-1">{accessDescription}</p>}
                      {(p.chaletLimit != null || p.serviceLimit != null) && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {p.chaletLimit != null ? `العقارات: ${p.chaletLimit === 999 ? "غير محدود" : p.chaletLimit}` : ""}
                          {p.chaletLimit != null && p.serviceLimit != null ? " · " : ""}
                          {p.serviceLimit != null ? `الخدمات: ${p.serviceLimit === 999 ? "غير محدود" : p.serviceLimit}` : ""}
                        </p>
                      )}
                    </div>
                    <div className="text-end shrink-0">
                        <p className="font-black text-lg text-foreground">{p.price.toLocaleString("ar-SA")}</p>
                      <p className="text-xs text-muted-foreground">⃁</p>
                    </div>
                  </button>
                );
              })}
              {selectedPlan && (
                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                  <p className="font-semibold">عرض التجديد الموحد — {selectedPlan.label}</p>
                  {planQuoteLoading && (
                    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> جارٍ احتساب الفاتورة من الخادم...
                    </p>
                  )}
                  {planQuote && (
                    <>
                      <div className="space-y-1 text-sm">
                        {planQuote.lines.map((line, index) => (
                          <div key={`${line.label ?? line.description ?? "quote-line"}-${index}`} className="flex justify-between gap-3">
                            <span>{line.quantity && line.quantity > 1 ? `${line.quantity} × ` : ""}{line.label ?? line.description ?? "بند الاشتراك"}</span>
                            <span>{line.amountHalala != null ? formatPrice(line.amountHalala) : "—"}</span>
                          </div>
                        ))}
                        <div className="flex justify-between gap-3 border-t border-primary/20 pt-2">
                          <span>المستحق الآن حسب عرض الخادم</span>
                          <span className="font-semibold">{formatPrice(planQuote.amountHalala)}</span>
                        </div>
                        {planQuote.discountHalala > 0 && (
                          <div className="flex justify-between gap-3 text-green-700">
                            <span>الخصم المعتمد</span>
                            <span>{formatPrice(planQuote.discountHalala)}</span>
                          </div>
                        )}
                        {planQuote.nextChargeHalala != null && (
                          <div className="flex justify-between gap-3 font-bold">
                            <span>إجمالي التجديد {cycleLabel(planQuote.days)}</span>
                            <span>{formatPrice(planQuote.nextChargeHalala)}</span>
                          </div>
                        )}
                      </div>
                      {planQuote.nextBillingAt && (
                        <p className="text-xs text-muted-foreground">موعد التجديد التالي: {formatDateWithHijri(planQuote.nextBillingAt)}</p>
                      )}
                      {planQuote.periodEnd && (
                        <p className="text-xs text-muted-foreground">نهاية الفترة: {formatDateWithHijri(planQuote.periodEnd)}</p>
                      )}
                    </>
                  )}
                  {selectedPlan.price > 0 && (
                    planQuote && selectedRecurringReady ? <>
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          data-testid="checkbox-subscription-recurring-consent"
                          checked={consentToRecurring}
                          disabled={paying || !!pendingCheckout || planQuoteLoading || planQuote.promoCode !== promoCode.trim()}
                          onChange={(event) => setConsentToRecurring(event.target.checked)}
                          className="mt-1"
                        />
                        <span>
                          أوافق صراحةً على حفظ وسيلة الدفع وتجديد بنود الفاتورة أعلاه بمبلغ إجمالي {formatPrice(planQuote.nextChargeHalala!)} {cycleLabel(planQuote.days)} ضمن فاتورة واحدة في الموعد الموضح. يتم التجديد فقط بعد نجاح حفظ البطاقة وتأكيد النظام.
                        </span>
                      </label>
                      <Button
                        className="w-full"
                        data-testid="button-continue-subscription-checkout"
                        onClick={handleContinueWithPlan}
                        disabled={!consentToRecurring || paying || planQuoteLoading ||
                          planQuote.promoCode !== promoCode.trim() || !!pendingCheckout || !!walletPending || redeemMutation.isPending}
                      >
                        متابعة إلى الدفع
                      </Button>
                    </> : (
                      <div className="space-y-2">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                          {planQuoteLoading
                            ? "جارٍ تحميل عرض السعر قبل الموافقة."
                              : !planQuote
                                ? payError ?? "تعذّر تحميل عرض الخادم؛ تحقق من رمز الخصم وحاول مجدداً."
                              : "التجديد الموحد أو حفظ وسيلة الدفع غير مهيأ حالياً. لن يبدأ الدفع قبل إعداد ذلك."}
                        </p>
                        {planQuote && <Button className="w-full" disabled>الدفع غير متاح حالياً</Button>}
                      </div>
                    )
                  )}
                  {selectedPlan.price > 0 && planQuote && !planQuoteLoading && planQuote.amountHalala > 0 && (() => {
                    const bal = wallet.data?.balanceHalalas;
                    const covers = bal != null && bal >= planQuote.amountHalala;
                    return (
                      <div className="rounded-xl border border-[#8C6246]/30 bg-[#8C6246]/5 p-3 space-y-2" data-testid="option-subscription-wallet">
                        <p className="flex items-center gap-2 text-sm font-semibold"><Wallet className="h-4 w-4 text-[#8C6246]" /> أو ادفع من رصيد المحفظة</p>
                        <p className="text-xs text-muted-foreground">
                          الرصيد الحالي: {bal == null ? (wallet.isError ? "تعذّر التحميل" : "جارٍ التحميل") : formatPrice(bal)} — يجب أن يغطي كامل المستحق الآن ({formatPrice(planQuote.amountHalala)}). لا يتم الجمع بين المحفظة والبطاقة.
                        </p>
                        <p className="text-xs text-muted-foreground">الدفع من المحفظة لا يحفظ بطاقة ولا يفعّل تجديداً تلقائياً؛ ستحتاج لتجديد الاشتراك يدوياً عند انتهائه.</p>
                        <Button
                          className="w-full bg-[#8C6246] hover:bg-[#734f36] text-white"
                          data-testid="button-subscription-wallet-pay"
                          onClick={handleWalletPay}
                          disabled={!covers || paying || planQuoteLoading || planQuote.promoCode !== promoCode.trim() ||
                            !!pendingCheckout || !!walletPending || redeemMutation.isPending || walletPayMutation.isPending}
                        >
                          {walletPayMutation.isPending || (paying && walletLock.current) ? "جارٍ الدفع من المحفظة..." : `الدفع من المحفظة (${formatPrice(planQuote.amountHalala)})`}
                        </Button>
                      </div>
                    );
                  })()}
                  {selectedPlan.price === 0 && (
                    <Button
                      className="w-full"
                      data-testid="button-activate-free-subscription"
                      onClick={handleContinueWithPlan}
                      disabled={paying || planQuoteLoading || !planQuote ||
                        planQuote.promoCode !== promoCode.trim() || !!pendingCheckout || !!walletPending || redeemMutation.isPending}
                    >
                      تفعيل الخطة المجانية
                    </Button>
                  )}
                </div>
              )}
              {payError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3 mt-1">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {payError}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── Step: Payment Form ── */}
        {step === "pay" && selectedPlan && (
          <>
            <DialogHeader className="p-6 pb-2 bg-gradient-to-br from-primary/10 to-background shrink-0">
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary" />
                إتمام الدفع
              </DialogTitle>
              <DialogDescription>
                <span className="font-semibold">{initiateData?.label ?? selectedPlan.label}</span>
                {" — "}
                <span className="font-black text-foreground">
                  {initiateData ? `المستحق الآن: ${formatPrice(initiateData.amountHalala)}` : "جارٍ احتساب المبلغ"}
                </span>
                {initiateData && initiateData.discountHalala > 0 && (
                  <span className="ms-2 text-xs text-muted-foreground line-through">
                    {formatPrice(selectedPlan.price * 100)}
                  </span>
                )}
                {" لمدة "}
                <span>{initiateData?.days ?? selectedPlan.days} يوم</span>
              </DialogDescription>
            </DialogHeader>

            <div className="p-5 space-y-4 overflow-y-auto flex-1" style={{ paddingBottom: '100px' }}>
              {initiateData && (
                <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm" data-testid="summary-subscription-checkout">
                  <p className="font-bold">فاتورة الاشتراك الموحدة</p>
                  {initiateData.lines?.length ? (
                    <div className="mt-2 space-y-1">
                      {initiateData.lines.map((line, index) => (
                        <div key={`${line.label ?? line.description ?? "line"}-${index}`} className="flex justify-between gap-3">
                          <span>{line.quantity && line.quantity > 1 ? `${line.quantity} × ` : ""}{line.label ?? line.description ?? "بند الاشتراك"}</span>
                          <span>{line.amountHalala != null ? formatPrice(line.amountHalala) : line.amount != null ? `${line.amount.toLocaleString("ar-SA")} ⃁` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-muted-foreground">لم يرسل الخادم تفاصيل بنود الفاتورة؛ مبلغ الدفع المؤكد أعلاه هو المرجع.</p>
                  )}
                  <p className="mt-2 font-semibold">المستحق الآن: {formatPrice(initiateData.amountHalala)}</p>
                  {initiateData.recurring && initiateData.nextChargeHalala != null && (
                    <p className="mt-1">إجمالي الفاتورة عند التجديد {cycleLabel(initiateData.days)}: {formatPrice(initiateData.nextChargeHalala)}</p>
                  )}
                  {initiateData.nextBillingAt && (
                    <p className="mt-1 text-xs text-muted-foreground">موعد التجديد التالي: {formatDateWithHijri(initiateData.nextBillingAt)}</p>
                  )}
                  {initiateData.periodEnd && (
                    <p className="mt-1 text-xs text-muted-foreground">نهاية الفترة الحالية: {formatDateWithHijri(initiateData.periodEnd)}</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">لن يُفعّل التجديد ما لم تُحفظ وسيلة الدفع وتُؤكد صلاحيتها من النظام.</p>
                </div>
              )}
              {/* Moyasar form mount point */}
              {initiateData?.amountHalala !== 0 && !scriptReady && (
                <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">جارٍ تحميل بوابة الدفع...</span>
                </div>
              )}
              {initiateData?.amountHalala !== 0 && <div ref={formContainerRef} id="moyasar-form" />}

              {initiateData && initiateData.discountHalala > 0 && (
                <p className="text-sm text-green-700 bg-green-50 rounded-xl p-3" data-testid="text-promo-discount">
                  وفّرت {formatPrice(initiateData.discountHalala)} باستخدام رمز الخصم.
                </p>
              )}

              {paying && (
                <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">جارٍ تأكيد الدفع وتفعيل الاشتراك...</span>
                </div>
              )}
              {payError && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-xl p-3">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {payError}
                </div>
              )}

              {/* Test card note */}
              <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-xl p-3">
                <ShieldCheck className="w-4 h-4 shrink-0 text-green-500 mt-0.5" />
                <div>
                  <span className="font-semibold text-foreground">وضع الاختبار (Test Mode)</span>
                  <br />
                  استخدم رقم البطاقة: <span className="font-mono text-foreground">4111 1111 1111 1111</span> / أي تاريخ مستقبلي / أي CVC
                  <br />
                  لبطاقة mada: <span className="font-mono text-foreground">5588 4817 3519 6601</span>
                </div>
              </div>

                <Button
                variant="outline"
                className="w-full rounded-xl"
                onClick={() => { setStep("plan"); setPayError(null); }}
                disabled={paying}
              >
                العودة لاختيار الخطة
              </Button>
            </div>
          </>
        )}

        {/* ── Step: Success ── */}
        {step === "success" && invoice && (
          <div className="p-8 flex flex-col items-center text-center gap-5">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">تم الدفع بنجاح! 🎉</h2>
              <p className="text-sm text-muted-foreground mt-1">اشتراكك الآن نشط</p>
            </div>

            <div className="w-full bg-card border border-border rounded-2xl p-4 text-sm text-start space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">الخطة</span>
                <span className="font-semibold">{invoice.label}</span>
              </div>
              {(invoice.lines ?? invoice.lineItems)?.length ? (
                <div className="w-full rounded-2xl border border-border p-4 text-sm text-start space-y-2">
                  <p className="font-bold">بنود الفاتورة الموحدة</p>
                  {(invoice.lines ?? invoice.lineItems)!.map((line, index) => (
                    <div key={`${line.label ?? line.description ?? "invoice-line"}-${index}`} className="flex justify-between gap-3">
                      <span>{line.quantity && line.quantity > 1 ? `${line.quantity} × ` : ""}{line.label ?? line.description ?? "بند الاشتراك"}</span>
                      <span>{line.amountHalala != null ? formatPrice(line.amountHalala) : line.amount != null ? `${line.amount.toLocaleString("ar-SA")} ${invoice.currency}` : "—"}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              {invoice.recurring && (
                <div className="w-full rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-start text-green-900 dark:border-green-900 dark:bg-green-950/30 dark:text-green-100">
                  <p className="font-semibold">التجديد {cycleLabel(invoice.cycleDays ?? selectedPlan?.days ?? 30)}</p>
                  {invoice.nextChargeHalala != null
                    ? <p className="mt-1">إجمالي رسوم الدورة التالية: {formatPrice(invoice.nextChargeHalala)}</p>
                    : <p className="mt-1">لم يرسل الخادم مبلغ التجديد التالي.</p>}
                  {invoice.nextBillingAt && <p className="mt-1">موعد التجديد التالي: {formatDateWithHijri(invoice.nextBillingAt)}</p>}
                </div>
              )}
              {paidByWallet && (
                <p role="status" className="w-full rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100" data-testid="text-paid-by-wallet">
                  دُفع كامل المبلغ من رصيد المحفظة؛ لم تُحفظ بطاقة ولم يُفعّل تجديد تلقائي جديد.
                </p>
              )}
              {activationWithoutSavedCard && (
                <p role="status" className="w-full rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
                  تم التفعيل دون تحصيل بطاقة؛ لم تُحفظ وسيلة دفع ولم يُفعّل التجديد التلقائي.
                </p>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">المبلغ المدفوع</span>
                  <span className="font-bold text-green-700">{invoice.amount.toLocaleString("ar-SA")} {invoice.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">تاريخ الدفع</span>
                <span className="font-medium">{formatDateWithHijri(invoice.paidAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  صالح حتى
                </span>
                <span className="font-semibold text-primary">
                  {formatDateWithHijri(invoice.expiresAt)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">رقم المرجع</span>
                <span className="font-mono text-xs text-muted-foreground">{invoice.paymentId.slice(0, 16)}...</span>
              </div>
            </div>

            <div className="flex gap-2 w-full">
              <Button
                className="flex-1 rounded-xl gap-2"
                onClick={() => downloadInvoice(invoice)}
              >
                <Download className="w-4 h-4" />
                تحميل الفاتورة
              </Button>
              <Button
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={closeModal}
              >
                إغلاق
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
