import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  CreditCard, ArrowRight, CheckCircle2, Clock, AlertTriangle,
  Building2, Star, Zap, Crown, Package, RefreshCw, MessageCircle,
  CalendarDays, ShieldCheck, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/Navbar";
import { useAuth } from "@workspace/replit-auth-web";
import { PaymentModal } from "@/components/PaymentModal";
import { AddonPaymentModal } from "@/components/AddonPaymentModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
async function apiFetch(path: string) {
  return fetch(`${BASE}/api${path}`, { credentials: "include" });
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
    label: "تجريبي",
    icon: <Clock className="w-5 h-5" />,
    color: "from-stone-500 to-stone-400",
    features: [
      "إدارة العقارات والخدمات",
      "إدارة الحجوزات والعملاء",
      "إدارة المصروفات والتقارير المالية",
      "إدارة الموظفين والإعدادات",
      "جميع أقسام المنصة متاحة خلال شهر التجربة المجاني",
    ],
  },
  monthly: {
    label: "شهري",
    icon: <Package className="w-5 h-5" />,
    color: "from-amber-700 to-amber-500",
    features: [
      "شاليه واحد",
      "خدمة تقديم واحدة",
      "تقارير شهرية",
      "إدارة مالية كاملة",
      "دعم فني بالواتساب",
    ],
  },
  yearly: {
    label: "سنوي",
    icon: <Crown className="w-5 h-5" />,
    color: "from-amber-600 to-yellow-500",
    features: [
      "حتى 3 شاليهات",
      "حتى 3 خدمات",
      "تقارير سنوية",
      "إدارة مالية كاملة",
      "دعم فني أولوية",
      "تقارير قابلة للمشاركة",
    ],
  },
  chalet_basic: {
    label: "شاليه — أساسي",
    icon: <Building2 className="w-5 h-5" />,
    color: "from-stone-600 to-amber-500",
    features: ["شاليه واحد", "إدارة الحجوزات", "تقارير أساسية"],
  },
  chalet_pro: {
    label: "شاليه — احترافي",
    icon: <Zap className="w-5 h-5" />,
    color: "from-amber-700 to-orange-500",
    features: ["حتى 5 شاليهات", "إدارة مالية كاملة", "تقارير تفصيلية", "دعم أولوية"],
  },
  chalet_unlimited: {
    label: "شاليه — غير محدود",
    icon: <Crown className="w-5 h-5" />,
    color: "from-amber-800 to-amber-600",
    features: ["شاليهات غير محدودة", "إدارة مالية كاملة", "تقارير تفصيلية", "دعم أولوية VIP"],
  },
  service_basic: {
    label: "خدمات — أساسي",
    icon: <Star className="w-5 h-5" />,
    color: "from-stone-500 to-stone-400",
    features: ["خدمة واحدة", "ملف مزود الخدمة", "إدارة أساسية"],
  },
  service_pro: {
    label: "خدمات — احترافي",
    icon: <Zap className="w-5 h-5" />,
    color: "from-stone-600 to-amber-600",
    features: ["خدمات غير محدودة", "ملف موسع", "إدارة كاملة", "دعم أولوية"],
  },
  bundle: {
    label: "حزمة شاملة",
    icon: <Crown className="w-5 h-5" />,
    color: "from-amber-600 to-orange-500",
    features: ["شاليهات + خدمات غير محدودة", "إدارة مالية كاملة", "تقارير VIP", "دعم أولوية قصوى"],
  },
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showPayment, setShowPayment] = useState(false);
  const [addonType, setAddonType] = useState<"chalet" | "service" | null>(null);

  const { data: sub, isLoading: subLoading } = useQuery<{
    id: number | null; plan: string; status: string; expiresAt: string | null;
    paymentStatus: string; createdAt: string;
    planDetails?: { nameAr: string; features: string[]; scope: string | null } | null;
  } | null>({
    queryKey: ["owner", "subscription"],
    queryFn: async () => {
      const r = await apiFetch("/owner/subscription");
      if (!r.ok) return null;
      return r.json();
    },
    enabled: isAuthenticated,
  });

  const { data: planLimits } = useQuery<{
    plan: string; active?: boolean; chaletLimit: number; chaletCount: number;
    serviceLimit: number; serviceCount?: number;
    extraChaletPrice?: number | string | null; extraServicePrice?: number | string | null;
  }>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) return { plan: "trial", chaletLimit: 1, chaletCount: 0, serviceLimit: 1, serviceCount: 0 };
      return r.json();
    },
    enabled: isAuthenticated,
  });

  if (authLoading || subLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const plan = sub?.plan ?? "trial";
  const fallbackMeta = PLAN_META[plan] ?? PLAN_META.trial;
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
                <span>ينتهي: {sub.expiresAt ? new Date(sub.expiresAt).toLocaleDateString("ar-SA") : "—"}</span>
              </div>
            </div>
          )}
        </motion.div>

        {sub?.status === "expired" && (
          <div className="mb-6 rounded-2xl border border-red-300 bg-red-50 p-5 text-red-900 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200" role="alert" data-testid="status-subscription-expired">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold">انتهى اشتراكك وتوقفت إتاحة عقاراتك وخدماتك للعملاء</p>
                <p className="mt-1 text-sm">جدّد الآن لاستعادة ظهورها ومتابعة استقبال الحجوزات.</p>
              </div>
              <Button className="shrink-0 gap-2" onClick={() => setShowPayment(true)} data-testid="button-renew-expired-subscription">
                <CreditCard className="w-4 h-4" />
                جدّد الاشتراك الآن
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
            sub="مستخدم / الحد الأقصى"
            bg="bg-indigo-50 dark:bg-indigo-900/20"
          />
          <SummaryCard
            icon={<Star className="w-5 h-5 text-amber-500" />}
            label="الخدمات"
            value={`${serviceUsed} / ${serviceMax}`}
            sub="الحد الأقصى المسموح"
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

        {planLimits?.active && (
          <div className="mb-6 grid gap-3 sm:grid-cols-2">
            {planLimits.chaletCount >= planLimits.chaletLimit && planLimits.extraChaletPrice != null && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold">تحتاج إلى سعة عقار إضافية؟</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  إضافة عقار واحد مقابل {Number(planLimits.extraChaletPrice).toLocaleString("ar-SA")} ر.س، دفعة واحدة.
                </p>
                <Button className="mt-3 w-full gap-2" variant="outline" onClick={() => setAddonType("chalet")}>
                  <Building2 className="h-4 w-4" />
                  شراء عقار إضافي
                </Button>
              </div>
            )}
            {(planLimits.serviceCount ?? 0) >= planLimits.serviceLimit && planLimits.extraServicePrice != null && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold">تحتاج إلى سعة خدمة إضافية؟</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  إضافة خدمة واحدة مقابل {Number(planLimits.extraServicePrice).toLocaleString("ar-SA")} ر.س، دفعة واحدة.
                </p>
                <Button className="mt-3 w-full gap-2" variant="outline" onClick={() => setAddonType("service")}>
                  <Star className="h-4 w-4" />
                  شراء خدمة إضافية
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
              {sub?.expiresAt ? new Date(sub.expiresAt).toLocaleDateString("ar-SA") : "غير محدد"}
            </dd>

            <dt className="text-muted-foreground">الأيام المتبقية</dt>
            <dd className={`font-bold text-end ${(days ?? 99) < 7 ? "text-red-600" : "text-foreground"}`}>
              {days !== null ? `${Math.max(0, days)} يوم` : "—"}
            </dd>

            <dt className="text-muted-foreground">حالة الدفع</dt>
            <dd className={`font-semibold text-end ${paymentCls}`}>
              {paymentLabel[sub?.paymentStatus ?? "pending"] ?? "—"}
            </dd>
          </dl>
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
