import { CreditCard, ExternalLink } from "lucide-react";
import { formatDateWithHijri } from "@/lib/hijri";
import { toArN } from "@/components/owner/owner-formatting";


export function toEasternArabic(n: string | number): string {
  return String(n).replace(/\d/g, d => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}
export function fromEasternArabic(s: string): string {
  return s.replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export type DashboardSubscription = {
  plan: string;
  status: string;
  expiresAt: string | null;
  trialStartedAt?: string | null;
  paymentStatus: string;
  reminderPreviewMilestone?: 3 | 0;
  freeAccess?: {
    active: boolean;
    expiresAt: string | null;
    reason: string;
    createdAt: string;
  } | null;
};

export function subscriptionDaysRemaining(subscription: DashboardSubscription): number | null {
  if (!subscription.expiresAt) return null;
  const expiresAt = new Date(subscription.expiresAt).getTime();
  if (!Number.isFinite(expiresAt)) return null;
  // Match the backend's remaining-days calculation (ceil of elapsed 24-hour periods).
  return Math.ceil((expiresAt - Date.now()) / 86_400_000);
}

export function isSubscriptionExpiryWarning(subscription: DashboardSubscription | null | undefined): boolean {
  if (!subscription) return false;
  if (subscription.status === "expired") return true;
  if (subscription.status !== "active" && subscription.status !== "trial") return false;
  const daysRemaining = subscriptionDaysRemaining(subscription);
  return daysRemaining !== null && daysRemaining <= 5;
}

export type OwnerPlanLimits = {
  canSubmitActivities?: boolean;
  plan: string;
  active?: boolean;
  scope?: "full" | "property";
  chaletLimit: number;
  chaletCount: number;
  serviceLimit: number;
  serviceCount: number;
  extraChaletPrice?: number | string | null;
  extraServicePrice?: number | string | null;
  freeAccess?: DashboardSubscription["freeAccess"];
};

export function SubscriptionAccountBanner({
  subscription,
  onManage,
}: {
  subscription: DashboardSubscription;
  onManage: () => void;
}) {
  const planLabels: Record<string, string> = {
    trial: "تجريبي", monthly: "شهري", yearly: "سنوي",
    chalet_basic: "عقار — أساسي", chalet_pro: "عقار — احترافي",
    chalet_unlimited: "عقار — غير محدود", service_basic: "خدمات — أساسي",
    service_pro: "خدمات — احترافي", bundle: "حزمة شاملة",
  };
  const statusCls: Record<string, string> = {
    active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    trial: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  };
  const days = subscriptionDaysRemaining(subscription);

  return (
    <button
      type="button"
      onClick={onManage}
      className={`mb-5 w-full border rounded-2xl px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap text-sm transition-colors text-start cursor-pointer ${
        subscription.freeAccess?.active
          ? "bg-emerald-50 border-emerald-300 text-emerald-950 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-100"
          : subscription.status === "expired"
            ? "bg-red-50 border-red-300 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-200"
            : "bg-card border-border hover:bg-accent/40"
      }`}
    >
      <CreditCard className={`w-4 h-4 shrink-0 ${subscription.freeAccess?.active ? "text-emerald-700 dark:text-emerald-300" : "text-primary"}`} />
      <span className="font-semibold">
        {subscription.freeAccess?.active ? "صلاحية مجانية كاملة" : subscription.status === "expired" ? "انتهى اشتراكك" : "حسابي والاشتراك"}
      </span>
      <span className="font-medium text-muted-foreground">
        {subscription.freeAccess?.active ? "كامل المزايا — دون دفع" : planLabels[subscription.plan] ?? subscription.plan}
      </span>
      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
        subscription.freeAccess?.active
          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
          : statusCls[subscription.status] ?? "bg-muted text-muted-foreground"
      }`}>
        {subscription.freeAccess?.active
          ? "مجاني بالكامل ✓"
          : ({ active: "نشط ✓", trial: "تجريبي", pending_activation: "بانتظار تفعيل أول نشاط", expired: "منتهي", suspended: "موقوف" }[subscription.status] ?? subscription.status)}
      </span>
      {subscription.freeAccess?.active ? (
        <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
          {subscription.freeAccess.expiresAt
            ? `الصلاحية حتى ${formatDateWithHijri(subscription.freeAccess.expiresAt)}`
            : "الصلاحية مفتوحة"}
        </span>
      ) : subscription.status === "pending_activation" ? (
        <span className="text-sm font-medium text-foreground">تبدأ التجربة المجانية لمدة ٣٠ يوماً عند قبول الإدارة وتفعيل أول عقار أو خدمة.</span>
      ) : days !== null && (
        <span className={`text-xs font-medium ${days < 7 ? "text-red-600" : "text-muted-foreground"}`}>
          {subscription.status === "expired" ? "جدّد الآن لمواصلة استقبال الحجوزات" : `${toArN(Math.max(0, days))} يوم متبقي`}
        </span>
      )}
      {subscription.freeAccess?.active && (
        <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200">
          التجديد التلقائي المدفوع متوقف
          {subscription.freeAccess.reason ? ` · السبب: ${subscription.freeAccess.reason}` : ""}
        </span>
      )}
      <span className="sm:ms-auto flex items-center gap-1.5 text-xs font-semibold text-primary">
        {subscription.freeAccess?.active ? "عرض التفاصيل" : subscription.status === "expired" ? "تجديد الاشتراك" : "إدارة"}
        <ExternalLink className="w-3.5 h-3.5" />
      </span>
    </button>
  );
}
