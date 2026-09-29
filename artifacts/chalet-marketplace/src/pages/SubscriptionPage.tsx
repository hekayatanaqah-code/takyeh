import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import {
  CreditCard, ArrowRight, CheckCircle2, Clock, AlertTriangle, Loader2,
  Building2, Star, Zap, Crown, Package, RefreshCw, MessageCircle,
  CalendarDays, ShieldCheck, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { useAuth } from "@workspace/replit-auth-web";
import { PaymentModal } from "@/components/PaymentModal";
import { AddonPaymentModal } from "@/components/AddonPaymentModal";
import { formatDualDate } from "@/lib/hijri";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string, options?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { credentials: "include", ...options });
}

interface SubscriptionAddon {
  id: number;
  addonType: "chalet" | "service";
  quantity: number;
  recurring: boolean;
  grandfathered?: boolean;
  monthlyUnitPriceHalala: number;
  paidThroughAt: string | null;
  cancelAtPeriodEnd: boolean;
  active?: boolean;
}

function formatHalala(halala: number) {
  return `${(halala / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

function expiryInBothCalendars(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "غير محدد";
  const localDate = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const { hijri, gregorian } = formatDualDate(localDate);
  return `${hijri} · ${gregorian} م`;
}

/* ── Plan meta ── */
interface PlanMeta {
  label: string;
  icon: React.ReactNode;
  color: string;
  features: string[];
}

const PLAN_META: Record<string, PlanMeta> = {
  trial: {
    label: "التجربة المجانية",
    icon: <Clock className="w-5 h-5" />,
    color: "from-stone-500 to-stone-400",
    features: [],
  },
  "property-monthly": {
    label: "إدارة العقار — شهري",
    icon: <Building2 className="w-5 h-5" />,
    color: "from-amber-700 to-amber-500",
    features: [],
  },
  "full-monthly": {
    label: "إدارة شاملة — شهري",
    icon: <Crown className="w-5 h-5" />,
    color: "from-amber-600 to-yellow-500",
    features: [],
  },
};

const UNKNOWN_PLAN_META: PlanMeta = {
  label: "اشتراك محفوظ",
  icon: <Package className="w-5 h-5" />,
  color: "from-stone-600 to-stone-400",
  features: [],
};

const STATUS_MAP: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  active:    { label: "نشط",    cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300", icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  trial:     { label: "تجريبي", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",    icon: <Clock className="w-3.5 h-3.5" /> },
  expired:   { label: "منتهي", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",         icon: <AlertTriangle className="w-3.5 h-3.5" /> },
  suspended: { label: "موقوف", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function SubscriptionPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showPayment, setShowPayment] = useState(false);
  const [addonType, setAddonType] = useState<"chalet" | "service" | null>(null);

  const { data: sub, isLoading: subLoading } = useQuery<{
    id: number | null; plan: string; status: string; expiresAt: string | null;
    paymentStatus: string; createdAt: string;
    planDetails?: { nameAr: string; features: string[]; scope: string | null } | null;
    recurring?: boolean;
    savedPaymentMethodAvailable?: boolean;
    nextBillingAt?: string | null;
    nextChargeHalala?: number;
    autoRenewEnabled?: boolean;
    autoRenewAvailable?: boolean;
    billingCycleDays?: number | null;
  } | null>({
    queryKey: ["owner", "subscription"],
    queryFn: async () => {
      const r = await apiFetch("/owner/subscription");
      if (!r.ok) return null;
      return r.json();
    },
    enabled: isAuthenticated,
  });

  const { data: planLimits, isLoading: planLimitsLoading } = useQuery<{
    plan: string; active?: boolean; chaletLimit: number; chaletCount: number;
    serviceLimit: number; serviceCount?: number;
    baseChaletLimit?: number; baseServiceLimit?: number;
    purchasedChaletSlots?: number; purchasedServiceSlots?: number;
    extraChaletPrice?: number | string | null; extraServicePrice?: number | string | null;
    recurringConfigured?: boolean; canSavePaymentMethod?: boolean;
    baseMonthlyHalala?: number;
  }>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) return { plan: "trial", chaletLimit: 1, chaletCount: 0, serviceLimit: 1, serviceCount: 0 };
      return r.json();
    },
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  const queryClient = useQueryClient();
  const addonsQuery = useQuery<SubscriptionAddon[]>({
    queryKey: ["owner", "subscription-addons"],
    queryFn: async () => {
      const response = await apiFetch("/owner/subscription/addons");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر تحميل الإضافات");
      if (!Array.isArray(data)) throw new Error("استجابة الإضافات غير صالحة");
      return data as SubscriptionAddon[];
    },
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const cancelAddonMutation = useMutation({
    mutationFn: async (purchaseId: number) => {
      const response = await apiFetch(`/owner/subscription/addons/${purchaseId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر إلغاء تجديد الإضافة");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "subscription-addons"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "plan-limits"] });
    },
  });
  const cancelAutoRenewMutation = useMutation({
    mutationFn: async () => {
      const response = await apiFetch("/owner/subscription/auto-renew/cancel", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "تعذّر إيقاف تجديد الاشتراك");
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "subscription"] });
      void queryClient.invalidateQueries({ queryKey: ["owner", "plan-limits"] });
    },
  });

  useEffect(() => {
    const requestedAddon = new URLSearchParams(search).get("addon");
    if (requestedAddon !== "chalet" && requestedAddon !== "service") return;
    if (planLimitsLoading || !planLimits) return;

    const isEligible = planLimits.active === true && (requestedAddon === "chalet"
      ? planLimits.extraChaletPrice != null
      : planLimits.extraServicePrice != null);
    if (isEligible) setAddonType(requestedAddon);
    navigate("/subscription", { replace: true });
  }, [search, planLimits, planLimitsLoading, navigate]);

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const plan = sub?.plan ?? "trial";
  const fallbackMeta = PLAN_META[plan] ?? UNKNOWN_PLAN_META;
  const meta = {
    ...fallbackMeta,
    label: sub?.planDetails?.nameAr ?? fallbackMeta.label,
    features: sub?.planDetails?.features ?? fallbackMeta.features,
  };
  const statusInfo = STATUS_MAP[sub?.status ?? "active"] ?? STATUS_MAP.active;
  const days = daysUntil(sub?.expiresAt ?? null);
  const chaletUsed = planLimits?.chaletCount ?? 0;
  const chaletMax = planLimits?.chaletLimit === Infinity ? "∞" : (planLimits?.chaletLimit ?? 1);
  const serviceMax = planLimits?.serviceLimit === Infinity ? "∞" : (planLimits?.serviceLimit ?? 1);
  const serviceUsed = planLimits?.serviceCount ?? 0;
  const chaletBase = planLimits?.baseChaletLimit ?? planLimits?.chaletLimit ?? 1;
  const serviceBase = planLimits?.baseServiceLimit ?? planLimits?.serviceLimit ?? 1;
  const chaletAddons = planLimits?.purchasedChaletSlots ?? Math.max(0, (planLimits?.chaletLimit ?? 1) - chaletBase);
  const serviceAddons = planLimits?.purchasedServiceSlots ?? Math.max(0, (planLimits?.serviceLimit ?? 1) - serviceBase);
  const billingCycleDays = Number.isSafeInteger(sub?.billingCycleDays) && (sub?.billingCycleDays ?? 0) > 0
    ? sub!.billingCycleDays!
    : null;
  const billingCycleLabel = billingCycleDays === 30 ? "شهرياً"
    : billingCycleDays != null ? `لكل دورة (${billingCycleDays} يوم)` : "لكل دورة";
  const addonPricePerCycle = (price: number | string) =>
    billingCycleDays == null ? "—" :
      (Math.round(Number(price) * 100 * billingCycleDays / 30) / 100).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const addonRecurringReady = planLimits?.recurringConfigured === true &&
    planLimits.canSavePaymentMethod === true &&
    Number.isSafeInteger(planLimits.baseMonthlyHalala) && billingCycleDays != null;

  const paymentCls =
    sub?.paymentStatus === "paid"    ? "text-green-600"
    : sub?.paymentStatus === "overdue" ? "text-red-600"
    : "text-amber-600";

  const paymentLabel: Record<string, string> = { paid: "مدفوع ✓", pending: "قيد الدفع", overdue: "متأخر ⚠️" };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />
      <div className="container mx-auto px-4 pt-8 pb-28 max-w-3xl">

        {/* Back */}
        <button
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          العودة إلى لوحة التحكم
        </button>

        <h1 className="text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-primary" />
          حسابي والاشتراك
        </h1>

        {/* ── Hero card: days remaining ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-gradient-to-br ${meta.color} rounded-3xl p-6 text-white mb-6 shadow-md`}
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1 opacity-90">
                {meta.icon}
                <span className="text-sm font-medium">الخطة الحالية</span>
              </div>
              <p className="text-3xl font-bold">{meta.label}</p>
              <div className={`inline-flex items-center gap-1.5 mt-3 text-xs font-semibold px-3 py-1 rounded-full bg-white/20`}>
                {statusInfo.icon}
                {statusInfo.label}
              </div>
            </div>
            <div className="text-end">
              {days !== null ? (
                <>
                  <p className={`text-5xl font-black ${days < 7 ? "text-red-200" : "text-white"}`}>{Math.max(0, days)}</p>
                  <p className="text-sm opacity-80 mt-0.5">يوم متبقي</p>
                </>
              ) : (
                <p className="text-2xl font-bold opacity-80">غير محدودة</p>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {days !== null && sub?.createdAt && (
            <div className="mt-5">
              {(() => {
                const totalMs = new Date(sub.expiresAt!).getTime() - new Date(sub.createdAt).getTime();
                const elapsedMs = Date.now() - new Date(sub.createdAt).getTime();
                const pct = Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
                return (
                  <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-white/70 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                );
              })()}
              <div className="flex justify-between text-xs opacity-70 mt-1">
                <span>بدأ: {new Date(sub.createdAt).toLocaleDateString("ar-SA")}</span>
                <span>ينتهي: {sub.expiresAt ? expiryInBothCalendars(sub.expiresAt) : "—"}</span>
              </div>
            </div>
          )}
        </motion.div>

        {(sub?.status === "expired" || (plan === "trial" && days !== null && days <= 0)) && (
          <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert" data-testid="status-subscription-expired">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">{plan === "trial" ? "انتهت تجربتك المجانية" : "انتهى اشتراكك وتوقفت إتاحة عقاراتك وخدماتك للعملاء"}</p>
                <p className="mt-1 text-sm">{plan === "trial" ? "اختر خطة مدفوعة للمتابعة؛ لن يتم تمديد التجربة تلقائياً." : "جدّد الآن لاستعادة ظهورها ومتابعة استقبال الحجوزات."}</p>
              </div>
              <Button className="shrink-0 gap-2" onClick={() => setShowPayment(true)} data-testid="button-renew-expired-subscription">
                <CreditCard className="w-4 h-4" />
                {plan === "trial" ? "اختر خطة مدفوعة" : "جدّد الاشتراك الآن"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6 [&>*]:shrink-0">
          <SummaryCard
            icon={<Building2 className="w-5 h-5 text-indigo-500" />}
            label="الشاليهات"
            value={`${chaletUsed} / ${chaletMax}`}
            sub={`مستخدم / الحد الفعلي · أساس ${chaletBase} + إضافي ${chaletAddons}`}
            bg="bg-indigo-50 dark:bg-indigo-900/20"
          />
          <SummaryCard
            icon={<Star className="w-5 h-5 text-amber-500" />}
            label="الخدمات"
            value={`${serviceUsed} / ${serviceMax}`}
            sub={`الحد الفعلي · أساس ${serviceBase} + إضافي ${serviceAddons}`}
            bg="bg-amber-50 dark:bg-amber-900/20"
          />
          <SummaryCard
            icon={<ShieldCheck className="w-5 h-5 text-green-500" />}
            label="حالة الدفع"
            value={paymentLabel[sub?.paymentStatus ?? "pending"] ?? "—"}
            sub=""
            bg="bg-green-50 dark:bg-green-900/20"
            valueCls={paymentCls}
          />
        </div>

        <section className="mb-6 rounded-2xl border border-border bg-card p-5" aria-labelledby="subscription-addons-heading">
          <h2 id="subscription-addons-heading" className="mb-3 flex items-center gap-2 font-bold">
            <Package className="h-4 w-4 text-primary" />
            الإضافات والرسوم الدورية
          </h2>
          {addonsQuery.isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الإضافات...
            </p>
          )}
          {addonsQuery.isError && (
            <p role="alert" className="text-sm text-destructive">{(addonsQuery.error as Error).message}</p>
          )}
          {addonsQuery.isSuccess && addonsQuery.data.length === 0 && (
            <p className="text-sm text-muted-foreground">لا توجد إضافات على اشتراكك حالياً.</p>
          )}
          {addonsQuery.data && addonsQuery.data.length > 0 && (
            <div className="space-y-3">
              {addonsQuery.data.map((addon) => {
                const isChalet = addon.addonType === "chalet";
                const cycleAmount = billingCycleDays == null
                  ? null
                  : Math.round(addon.monthlyUnitPriceHalala * addon.quantity * billingCycleDays / 30);
                const paidThrough = addon.paidThroughAt
                  ? new Date(addon.paidThroughAt).toLocaleDateString("ar-SA")
                  : "غير محدد";
                return (
                  <article key={addon.id} data-testid={`card-subscription-addon-${addon.id}`} className="rounded-xl border border-border p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1 text-sm">
                        <p className="font-semibold">
                          {isChalet ? "عقارات إضافية" : "خدمات إضافية"} · {addon.quantity.toLocaleString("ar-SA")}
                        </p>
                        <p className="text-muted-foreground">
                          {addon.recurring
                            ? cycleAmount == null
                              ? `سعر مرجعي ${formatHalala(addon.monthlyUnitPriceHalala)} لكل 30 يوماً؛ مبلغ الدورة غير متوفر`
                              : `${formatHalala(cycleAmount)} ${billingCycleLabel} — ${addon.quantity.toLocaleString("ar-SA")} × ${formatHalala(Math.round(addon.monthlyUnitPriceHalala * (billingCycleDays ?? 30) / 30))} لكل وحدة`
                            : "إضافة تاريخية لمرة واحدة — محفوظة مدى الحياة ولا تدخل في الفواتير الدورية"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {addon.recurring
                            ? addon.active === false ? `انتهت الفترة المدفوعة في: ${paidThrough}` : `مدفوعة حتى: ${paidThrough}`
                            : "لا يوجد تاريخ انتهاء"}
                          {addon.recurring && addon.cancelAtPeriodEnd ? " · سيتوقف التجديد عند نهاية الفترة المدفوعة" : ""}
                        </p>
                      </div>
                      {addon.recurring && addon.active !== false && !addon.cancelAtPeriodEnd && (
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`button-cancel-addon-${addon.id}`}
                          disabled={cancelAddonMutation.isPending}
                          onClick={() => {
                            const confirmed = window.confirm(
                              `هل تريد إيقاف تجديد ${isChalet ? "العقارات الإضافية" : "الخدمات الإضافية"}؟ ستبقى السعة متاحة حتى ${paidThrough}.`,
                            );
                            if (confirmed) cancelAddonMutation.mutate(addon.id);
                          }}
                        >
                          {cancelAddonMutation.isPending && cancelAddonMutation.variables === addon.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : "إيقاف التجديد"}
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {cancelAddonMutation.isError && (
            <p role="alert" className="mt-3 text-sm text-destructive">{cancelAddonMutation.error.message}</p>
          )}
        </section>

        {planLimits?.active && (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {planLimits.extraChaletPrice != null && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold">أضف عقارات إلى خطتك</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {addonRecurringReady
                    ? `${addonPricePerCycle(planLimits.extraChaletPrice)} ر.س ${billingCycleLabel} لكل عقار إضافي؛ يُحتسب المبلغ الأولي نسبياً حتى نهاية الفترة، ثم يُضم التجديد إلى فاتورة الخطة.`
                    : "الشراء والتجديد الدوري للإضافات غير مهيأ حالياً أو لا توجد وسيلة دفع قابلة للحفظ."}
                </p>
                <Button className="mt-3 w-full gap-2" variant="outline" disabled={!addonRecurringReady} onClick={() => setAddonType("chalet")}>
                  <Building2 className="h-4 w-4" />
                  طلب عقارات إضافية
                </Button>
              </div>
            )}
            {planLimits.extraServicePrice != null && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold">أضف خدمات إلى خطتك</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {addonRecurringReady
                    ? `${addonPricePerCycle(planLimits.extraServicePrice)} ر.س ${billingCycleLabel} لكل خدمة إضافية؛ يُحتسب المبلغ الأولي نسبياً حتى نهاية الفترة، ثم يُضم التجديد إلى فاتورة الخطة.`
                    : "الشراء والتجديد الدوري للإضافات غير مهيأ حالياً أو لا توجد وسيلة دفع قابلة للحفظ."}
                </p>
                <Button className="mt-3 w-full gap-2" variant="outline" disabled={!addonRecurringReady} onClick={() => setAddonType("service")}>
                  <Star className="h-4 w-4" />
                  طلب خدمات إضافية
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── Plan features ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-2xl p-5 mb-6"
        >
          <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            مميزات خطتك الحالية
          </h2>
          <ul className="space-y-2">
            {meta.features.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                {f}
              </li>
            ))}
          </ul>
        </motion.div>

        {/* ── Subscription details ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="bg-card border border-border rounded-2xl p-5 mb-6"
        >
          <h2 className="font-bold text-foreground mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-primary" />
            تفاصيل الاشتراك
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <dt className="text-muted-foreground">الخطة</dt>
            <dd className="font-semibold text-foreground text-end">{meta.label}</dd>

            <dt className="text-muted-foreground">الحالة</dt>
            <dd className="text-end">
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusInfo.cls}`}>
                {statusInfo.icon}
                {statusInfo.label}
              </span>
            </dd>

            <dt className="text-muted-foreground">تاريخ الانتهاء</dt>
            <dd className="font-semibold text-foreground text-end">
              {sub?.expiresAt ? expiryInBothCalendars(sub.expiresAt) : "غير محدد"}
            </dd>

            <dt className="text-muted-foreground">الأيام المتبقية</dt>
            <dd className={`font-bold text-end ${(days ?? 99) < 7 ? "text-red-600" : "text-foreground"}`}>
              {days !== null ? `${Math.max(0, days)} يوم` : "—"}
            </dd>

            <dt className="text-muted-foreground">حالة الدفع</dt>
            <dd className={`font-semibold text-end ${paymentCls}`}>
              {paymentLabel[sub?.paymentStatus ?? "pending"] ?? "—"}
            </dd>
            {(sub?.recurring === true || sub?.autoRenewAvailable === true ||
              sub?.nextChargeHalala != null || sub?.nextBillingAt != null) && (
              <>
                <dt className="text-muted-foreground">حالة التجديد التلقائي</dt>
                <dd className="font-semibold text-end">
                  {sub.autoRenewEnabled === true && sub.savedPaymentMethodAvailable === true
                    ? "مفعل مع وسيلة دفع محفوظة"
                    : "غير مفعل"}
                </dd>
                {sub.nextBillingAt && (
                  <>
                    <dt className="text-muted-foreground">{billingCycleDays === 30 ? "موعد التجديد الشهري" : billingCycleDays != null ? `موعد الدورة التالية (${billingCycleDays} يوم)` : "موعد الدورة التالية"}</dt>
                    <dd className="font-semibold text-end">{new Date(sub.nextBillingAt).toLocaleDateString("ar-SA")}</dd>
                  </>
                )}
                {sub.nextChargeHalala != null && (
                  <>
                    <dt className="text-muted-foreground">{billingCycleDays === 30 ? "إجمالي الفاتورة الشهرية التالية" : billingCycleDays != null ? `إجمالي الفاتورة للدورة (${billingCycleDays} يوم)` : "إجمالي الفاتورة للدورة التالية"}</dt>
                    <dd className="font-semibold text-end">{formatHalala(sub.nextChargeHalala)}</dd>
                  </>
                )}
              </>
            )}
          </dl>
          {sub?.autoRenewEnabled !== true && (sub?.nextChargeHalala != null || sub?.nextBillingAt) && (
            <p className="mt-3 text-xs text-muted-foreground">
              المبلغ والموعد المعروضان تقديريان للدورة التالية؛ لن يحدث تحصيل تلقائي ما دام التجديد غير مفعل.
            </p>
          )}
          {sub?.autoRenewEnabled === true && (
            <div className="mt-4 space-y-2">
              <Button
                type="button"
                variant="outline"
                disabled={cancelAutoRenewMutation.isPending}
                onClick={() => {
                  if (window.confirm("هل تريد إيقاف التجديد التلقائي للباقة والإضافات؟ ستظل السعة متاحة حتى نهاية الفترة المدفوعة.")) {
                    cancelAutoRenewMutation.mutate();
                  }
                }}
              >
                {cancelAutoRenewMutation.isPending ? "جارٍ الإيقاف..." : "إيقاف التجديد التلقائي للباقة والإضافات"}
              </Button>
              {cancelAutoRenewMutation.isError && (
                <p role="alert" className="text-sm text-destructive">{cancelAutoRenewMutation.error.message}</p>
              )}
            </div>
          )}
        </motion.div>

        {/* ── Action buttons ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <Button
            size="lg"
            className="rounded-2xl font-bold w-full gap-2"
            onClick={() => setShowPayment(true)}
          >
            <Crown className="w-4 h-4" />
            ترقية / تجديد
          </Button>

          <Button
            size="lg"
            variant="outline"
            className="rounded-2xl font-bold w-full gap-2"
            onClick={() => {
              const msg = encodeURIComponent(`مرحباً، لدي استفسار حول اشتراكي في منصة حكاية أناقة.`);
              const a = document.createElement("a");
              a.href = `https://wa.me/966500000000?text=${msg}`;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
            }}
          >
            <MessageCircle className="w-4 h-4" />
            تواصل معنا
          </Button>

          <Button
            size="lg"
            variant="ghost"
            className="rounded-2xl font-bold w-full gap-2 text-muted-foreground"
            onClick={() => navigate("/dashboard")}
          >
            <RefreshCw className="w-4 h-4" />
            العودة للوحة
          </Button>
        </motion.div>

      </div>

      <PaymentModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        currentPlan={plan}
      />
      <AddonPaymentModal
        open={addonType !== null}
        onClose={() => setAddonType(null)}
        addonType={addonType ?? "chalet"}
      />
    </div>
  );
}

/* ── Summary Card ── */
function SummaryCard({
  icon, label, value, sub, bg, valueCls,
}: {
  icon: React.ReactNode; label: string; value: string; sub: string;
  bg: string; valueCls?: string;
}) {
  return (
    <div className={`${bg} rounded-2xl p-4 flex flex-col gap-1`}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        {icon}
        {label}
      </div>
      <p className={`text-xl font-black ${valueCls ?? "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
