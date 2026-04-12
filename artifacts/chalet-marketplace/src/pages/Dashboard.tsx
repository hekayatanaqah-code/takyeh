import { useEffect, useState, useMemo, useRef, useCallback, createContext, useContext, type ReactElement } from "react";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMySubmissions } from "@workspace/api-client-react";
import { useStaffAuth } from "@/lib/useStaffAuth";
import { TAB_PERMISSION, ALL_PERM_KEYS, PERM_LABELS } from "@/lib/staffPermissions";
import type { PermKey, StaffPermissions } from "@/lib/staffPermissions";
import { Switch } from "@/components/ui/switch";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DualCalendarPicker } from "@/components/ui/DualCalendarPicker";
import { formatDualDate, toHijri } from "@/lib/hijri";
import { toAr } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  User, LogOut, LogIn, Plus, MapPin, Calendar, Clock, CheckCircle,
  XCircle, Home, BookOpen, Trash2, Building2, Globe, Phone, AlertTriangle,
  RotateCcw, Star, ChevronLeft, ChevronRight, BarChart2, CreditCard,
  TrendingUp, Sunrise, Moon, Sun, Lock, Zap, DollarSign, Users,
  Wallet, Receipt, TrendingDown, Edit2, UserCheck, ChevronDown, ChevronUp,
  Camera, Loader2, FileText, Archive, Mail, MessageSquare, Settings, ExternalLink,
  Search, Activity, Banknote, Eye,
} from "lucide-react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from "recharts";
import QRCode from "qrcode";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    ...opts,
  });
}

/* ─── Read-Only mode context (admin impersonation) ──────── */
const ImpersonationCtx = createContext<{
  isReadOnly: boolean;
  onBlockedEdit: () => void;
}>({ isReadOnly: false, onBlockedEdit: () => {} });

function useReadOnly() { return useContext(ImpersonationCtx); }

const statusConfig = {
  pending:        { label: "قيد المراجعة",  icon: <Clock className="w-3.5 h-3.5" />,       className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  approved:       { label: "تمت الموافقة",  icon: <CheckCircle className="w-3.5 h-3.5" />,  className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  rejected:       { label: "مرفوض",         icon: <XCircle className="w-3.5 h-3.5" />,      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  needs_revision: { label: "يحتاج تعديل",  icon: <RotateCcw className="w-3.5 h-3.5" />,    className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
};

interface OwnerBooking {
  id: number;
  submissionId?: number | null;
  clientName: string;
  clientPhone?: string | null;
  bookingDate: string;
  durationDays: number;
  source: "platform" | "external";
  notes?: string | null;
  period?: string | null;
  revenueAmount?: string | null;
  totalPrice?: string | null;
  depositPaid?: string | null;
  insuranceFee?: string | null;
  balanceCollected: boolean;
  insuranceRefunded: boolean;
  insuranceDeducted?: string | null;
  insuranceDeductReason?: string | null;
  insuranceProofImages?: string | null; // JSON-encoded array of URLs
  createdAt: string;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  ratedAt?: string | null;
}

interface RescheduleLogItem {
  id: number;
  bookingId: number;
  clientName: string;
  clientPhone?: string | null;
  oldDate: string;
  newDate: string;
  oldDuration: number;
  newDuration: number;
  oldPeriod?: string | null;
  newPeriod?: string | null;
  reason: string;
  rescheduledAt: string;
}

interface ChaletAvailability {
  id: number;
  chaletId: number;
  dateStr: string;
  periodMorning: boolean;
  periodEvening: boolean;
  periodFullDay: boolean;
  notes: string | null;
}

interface DayPrice { morning?: number; evening?: number; fullDay?: number; }
interface ChaletSeason {
  id: number;
  submissionId: number;
  nameAr: string;
  startDate: string;
  endDate: string;
  price: string;
  priceMorning: string | null;
  priceEvening: string | null;
  priceFullDay: string | null;
  dailyPrices: Record<string, DayPrice> | null;
  period: string | null;
  createdAt: string;
}

/* ── Upgrade Popup + Chalets Tab ─────────────── */
const TIER_PLANS = [
  {
    key: "chalet_basic",
    name: "أساسي - شاليهات",
    price: "99 ر.س / شهر",
    chaletLimit: 1,
    serviceLimit: 0,
    features: ["شاليه واحد", "تقارير أساسية", "دعم عبر واتساب"],
    highlight: false,
  },
  {
    key: "chalet_pro",
    name: "احترافي - شاليهات",
    price: "199 ر.س / شهر",
    chaletLimit: 5,
    serviceLimit: 0,
    features: ["حتى 5 شاليهات", "تقارير تفصيلية", "أولوية في الدعم"],
    highlight: true,
  },
  {
    key: "chalet_unlimited",
    name: "غير محدود - شاليهات",
    price: "349 ر.س / شهر",
    chaletLimit: 999,
    serviceLimit: 0,
    features: ["شاليهات غير محدودة", "تقارير شهرية واتساب", "مدير حساب خاص"],
    highlight: false,
  },
  {
    key: "bundle",
    name: "باقة شاملة",
    price: "499 ر.س / شهر",
    chaletLimit: 999,
    serviceLimit: 999,
    features: ["شاليهات + خدمات غير محدودة", "تقارير متقدمة", "أولوية قصوى"],
    highlight: false,
  },
];

function UpgradePlanDialog({ open, onClose, context }: { open: boolean; onClose: () => void; context: "chalet" | "service" }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            ترقية الخطة
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {context === "chalet"
              ? "لقد وصلت إلى الحد الأقصى من الشاليهات في خطتك الحالية. اختر خطة أعلى للاستمرار."
              : "لقد وصلت إلى الحد الأقصى من الخدمات. اختر خطة أعلى للاستمرار."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {TIER_PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl border p-4 flex flex-col gap-3 ${
                plan.highlight
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlight && (
                <span className="text-xs font-bold bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full self-start">الأكثر طلباً</span>
              )}
              <div>
                <p className="font-bold text-foreground text-sm">{plan.name}</p>
                <p className="text-lg font-extrabold text-primary mt-0.5">{plan.price}</p>
              </div>
              <ul className="space-y-1.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant={plan.highlight ? "default" : "outline"}
                className="mt-auto w-full rounded-xl"
                onClick={() => {
                  const msg = `أريد الترقية إلى خطة: ${plan.name} (${plan.price})`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
                }}
              >
                اختر هذه الخطة
              </Button>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">سيتم التواصل معك عبر واتساب لإتمام الاشتراك</p>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit Chalet Basic Data Dialog ─────────────── */
function EditChaletDialog({
  open, sub, onClose, onSaved,
}: {
  open: boolean;
  sub: { id: number; nameAr: string; descriptionAr?: string; priceMorning?: string | null; priceEvening?: string | null; priceFullDay?: string | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [nameAr, setNameAr] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [priceMorning, setPriceMorning] = useState("");
  const [priceEvening, setPriceEvening] = useState("");
  const [priceFullDay, setPriceFullDay] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sub && open) {
      setNameAr(sub.nameAr ?? "");
      setDescriptionAr(sub.descriptionAr ?? "");
      setPriceMorning(sub.priceMorning ? String(Number(sub.priceMorning)) : "");
      setPriceEvening(sub.priceEvening ? String(Number(sub.priceEvening)) : "");
      setPriceFullDay(sub.priceFullDay ? String(Number(sub.priceFullDay)) : "");
    }
  }, [sub, open]);

  function normNum(v: string) {
    return v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
  }

  async function handleSave() {
    if (!sub || !nameAr.trim()) return;
    setSaving(true);
    try {
      const r = await apiFetch(`/owner/submissions/${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          nameAr: nameAr.trim(),
          descriptionAr: descriptionAr.trim(),
          priceMorning: priceMorning || "",
          priceEvening: priceEvening || "",
          priceFullDay: priceFullDay || "",
        }),
      });
      if (!r.ok) { toast({ title: "حدث خطأ أثناء الحفظ", variant: "destructive" }); return; }
      toast({ title: "تم تحديث بيانات الشاليه بنجاح" });
      qc.invalidateQueries({ queryKey: ["submissions"] });
      onSaved();
      onClose();
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-primary" />
            تعديل بيانات الشاليه
          </DialogTitle>
          <DialogDescription>تعديل الاسم والأسعار والوصف — تظهر فوراً على صفحة الشاليه</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">اسم الشاليه <span className="text-destructive">*</span></label>
            <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="اسم الشاليه" className="text-right" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">الوصف</label>
            <textarea
              value={descriptionAr}
              onChange={(e) => setDescriptionAr(e.target.value)}
              placeholder="وصف مختصر للشاليه..."
              rows={3}
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm text-right resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">الأسعار (ر.س)</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: "☀️ صباحي", val: priceMorning, set: setPriceMorning },
                { label: "🌙 مسائي", val: priceEvening, set: setPriceEvening },
                { label: "📅 يوم كامل", val: priceFullDay, set: setPriceFullDay },
              ] as const).map(({ label, val, set }) => (
                <div key={label} className="space-y-1">
                  <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={toAr(val)}
                    onChange={(e) => set(normNum(e.target.value))}
                    placeholder="٠"
                    className="text-right text-sm h-9"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button disabled={!nameAr.trim() || saving} onClick={handleSave} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            حفظ التعديلات
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BlockDatesDialog({
  open, chalet, onClose, onBlocked,
}: {
  open: boolean;
  chalet: { id: number; nameAr: string } | null;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("صيانة");
  const [loading, setLoading] = useState(false);

  function reset() { setStartDate(""); setEndDate(""); setReason("صيانة"); }

  async function handleBlock() {
    if (!chalet || !startDate || !endDate) return;
    setLoading(true);
    try {
      const r = await apiFetch("/owner/availability/bulk", {
        method: "POST",
        body: JSON.stringify({ chaletId: chalet.id, startDate, endDate, notes: reason }),
      });
      if (!r.ok) { toast({ title: "حدث خطأ", variant: "destructive" }); return; }
      const data = await r.json();
      toast({ title: `تم إغلاق ${toAr(data.blocked)} يوم بنجاح`, description: `${chalet.nameAr} — ${reason}` });
      onBlocked();
      onClose();
      reset();
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); } }}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-gray-500" />
            إغلاق أيام — {chalet?.nameAr}
          </DialogTitle>
          <DialogDescription>حدد نطاق التاريخ لمنع حجوزات الضيوف (صيانة، فعالية خاصة، إلخ)</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
              <DualCalendarPicker
                value={startDate}
                onChange={setStartDate}
                placeholder="من تاريخ"
                label="من تاريخ"
              />
            </div>
            <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
              <DualCalendarPicker
                value={endDate}
                onChange={setEndDate}
                placeholder="إلى تاريخ"
                label="إلى تاريخ"
                minDate={startDate || undefined}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">سبب الإغلاق</label>
            <div className="flex gap-2 flex-wrap">
              {["صيانة", "فعالية خاصة", "إجازة", "تجديد"].map((r) => (
                <button key={r} onClick={() => setReason(r)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${reason === r ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                  {r}
                </button>
              ))}
            </div>
            <Input className="mt-2" placeholder="أو اكتب سبباً آخر..." value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          {startDate && endDate && startDate <= endDate && (
            <div className="rounded-xl bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
              سيتم إغلاق {toAr(Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1)} يوم من {startDate.split("-").reverse().join("/")} إلى {endDate.split("-").reverse().join("/")}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); reset(); }}>إلغاء</Button>
          <Button
            disabled={!startDate || !endDate || !reason.trim() || loading || startDate > endDate}
            onClick={handleBlock}
            className="bg-gray-700 hover:bg-gray-800 text-white gap-1.5"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            إغلاق الأيام
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChaletsTab({ submissions, isLoading, ownerChalets }: { submissions: any[] | undefined; isLoading: boolean; ownerChalets: any[] }) {
  const qc = useQueryClient();
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [blockTarget, setBlockTarget] = useState<{ id: number; nameAr: string } | null>(null);
  const [editTarget, setEditTarget] = useState<any | null>(null);

  const { data: planLimits } = useQuery<{ plan: string; chaletLimit: number; chaletCount: number; serviceLimit: number }>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) return { plan: "trial", chaletLimit: 1, chaletCount: 0, serviceLimit: 1 };
      return r.json();
    },
  });

  const atChaletLimit = planLimits
    ? (submissions?.length ?? 0) >= planLimits.chaletLimit
    : false;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
      </div>
    );
  }
  if (!submissions || submissions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card border border-dashed border-border rounded-2xl p-12 text-center"
      >
        <Home className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد شاليهات بعد</h3>
        <p className="text-muted-foreground mb-6">ابدأ بإضافة شاليهك الأول للمراجعة والنشر</p>
        <Link href="/add-chalet">
          <Button>
            <Plus className="w-4 h-4 me-2" />
            إضافة شاليه جديد
          </Button>
        </Link>
      </motion.div>
    );
  }
  return (
    <div className="space-y-4">
      {/* Plan limit banner */}
      {planLimits && (
        <div className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-3 border ${
          atChaletLimit ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40" : "bg-muted/40 border-border"
        }`}>
          <div className="flex items-center gap-2 text-sm">
            {atChaletLimit ? (
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
            <span className={atChaletLimit ? "text-amber-700 dark:text-amber-400 font-medium" : "text-muted-foreground"}>
              {toAr(submissions.length)} / {planLimits.chaletLimit === 999 ? "∞" : toAr(planLimits.chaletLimit)} شاليه
              {atChaletLimit ? " — وصلت الحد الأقصى" : ""}
            </span>
          </div>
          {atChaletLimit && (
            <Button size="sm" variant="default" className="rounded-xl shrink-0 text-xs h-8" onClick={() => setShowUpgrade(true)}>
              <Zap className="w-3.5 h-3.5 me-1" />
              ترقية الخطة
            </Button>
          )}
        </div>
      )}
      <UpgradePlanDialog open={showUpgrade} onClose={() => setShowUpgrade(false)} context="chalet" />
      <BlockDatesDialog
        open={!!blockTarget}
        chalet={blockTarget}
        onClose={() => setBlockTarget(null)}
        onBlocked={() => qc.invalidateQueries({ queryKey: ["owner", "availability"] })}
      />
      <EditChaletDialog
        open={!!editTarget}
        sub={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["submissions"] })}
      />
      {submissions.map((sub: any, idx: number) => {
        const status = statusConfig[sub.status as keyof typeof statusConfig] ?? statusConfig.pending;
        const approvedChalet = ownerChalets.find((c: any) => c.submissionId === sub.id);
        const isApproved = sub.status === "approved" && !!approvedChalet;
        return (
          <motion.div
            key={sub.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              {sub.photos?.[0] ? (
                <img src={sub.photos[0]} alt={sub.nameAr} className="w-full sm:w-28 h-20 object-cover rounded-xl shrink-0" />
              ) : (
                <div className="w-full sm:w-28 h-20 bg-muted rounded-xl shrink-0 flex items-center justify-center">
                  <Home className="w-8 h-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <h3 className="text-lg font-bold text-foreground">{sub.nameAr}</h3>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${status.className}`}>
                    {status.icon}
                    {status.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    {sub.location}{sub.district ? ` - ${sub.district}` : ""}
                  </span>
                  {sub.pricePerNight && (
                    <span className="flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      {toAr(Number(sub.pricePerNight))} ر.س
                    </span>
                  )}
                  {sub.createdAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(sub.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{sub.descriptionAr}</p>

                {sub.adminNote && (sub.status === "rejected" || sub.status === "needs_revision") && (
                  <div className={`mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3 border ${
                    sub.status === "needs_revision"
                      ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40"
                      : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40"
                  }`}>
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${sub.status === "needs_revision" ? "text-orange-500" : "text-red-500"}`} />
                    <div>
                      <p className={`text-xs font-bold mb-0.5 ${sub.status === "needs_revision" ? "text-orange-700 dark:text-orange-400" : "text-red-700 dark:text-red-400"}`}>
                        {sub.status === "needs_revision" ? "ملاحظات الإدارة — يرجى التعديل والإعادة" : "سبب الرفض"}
                      </p>
                      <p className={`text-xs leading-relaxed ${sub.status === "needs_revision" ? "text-orange-800 dark:text-orange-300" : "text-red-800 dark:text-red-300"}`}>
                        {sub.adminNote}
                      </p>
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-border">
                  <Link href={`/my-chalet/${sub.id}`}>
                    <Button size="sm" className="gap-1.5 rounded-xl text-xs h-8">
                      <Eye className="w-3.5 h-3.5" />
                      تفاصيل الشاليه
                    </Button>
                  </Link>
                  {isApproved && (
                    <>
                      <Link href={`/chalets/${approvedChalet.id}`} target="_blank">
                        <Button size="sm" variant="outline" className="gap-1.5 rounded-xl text-xs h-8">
                          <ExternalLink className="w-3.5 h-3.5" />
                          معاينة للزبون
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 rounded-xl text-xs h-8 border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                        onClick={() => setBlockTarget({ id: approvedChalet.id, nameAr: sub.nameAr })}
                      >
                        <Lock className="w-3.5 h-3.5" />
                        إغلاق أيام
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Add Booking Dialog ──────────────────────── */
function AddBookingDialog({
  open, onClose, submissions, onAdded, existingBookings, prefilledDate, prefilledChaletId, availabilityBlocks,
}: {
  open: boolean;
  onClose: () => void;
  submissions: any[];
  onAdded: () => void;
  existingBookings?: OwnerBooking[];
  prefilledDate?: string | null;
  prefilledChaletId?: string | null;
  availabilityBlocks?: ChaletAvailability[];
}) {
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [isReturningCustomer, setIsReturningCustomer] = useState<boolean | null>(null);
  const [bookingDate, setBookingDate] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [period, setPeriod] = useState<string>("");
  const [source, setSource] = useState<"platform" | "external">("external");
  const [submissionId, setSubmissionId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [depositPaid, setDepositPaid] = useState("");
  const [insuranceFee, setInsuranceFee] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  /* ── Seasonal pricing hint ── */
  const activeSubNum = submissionId && submissionId !== "none" ? Number(submissionId) : submissions[0]?.id ?? null;
  const { data: dialogSeasons = [] } = useQuery<ChaletSeason[]>({
    queryKey: ["owner", "seasons", activeSubNum],
    queryFn: async () => {
      if (!activeSubNum) return [];
      const r = await apiFetch(`/owner/seasons?submissionId=${activeSubNum}`);
      return r.ok ? r.json() : [];
    },
    enabled: !!activeSubNum,
  });
  const activeSeason = useMemo<ChaletSeason | null>(() => {
    if (!bookingDate || !dialogSeasons.length) return null;
    return dialogSeasons.find((s) =>
      bookingDate >= s.startDate && bookingDate <= s.endDate &&
      (!s.period || !period || s.period === "all" || s.period === period)
    ) ?? null;
  }, [bookingDate, period, dialogSeasons]);

  /* ── Conflict detection: which periods are already booked across range ── */
  const conflictSet = useMemo(() => {
    const blocked = new Set<string>();
    if (!bookingDate || !existingBookings?.length) return blocked;
    const [sy, sm, sd] = bookingDate.split("-").map(Number);
    const duration = Math.max(1, durationDays);
    // Collect all dates in the selected range
    const rangeDates = new Set<string>();
    for (let i = 0; i < duration; i++) {
      const d = new Date(sy, sm - 1, sd + i);
      rangeDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    // Walk existing bookings and expand their dates
    for (const b of existingBookings) {
      if (!b.bookingDate) continue;
      // If a chalet is selected, only check conflicts for that chalet
      if (submissionId && submissionId !== "none" && b.submissionId !== Number(submissionId)) continue;
      const bDur = Math.max(1, b.durationDays ?? 1);
      const [by, bm, bd2] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < bDur; i++) {
        const d = new Date(by, bm - 1, bd2 + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (rangeDates.has(ds)) blocked.add(b.period ?? "full_day");
      }
    }
    return blocked;
  }, [bookingDate, durationDays, existingBookings, submissionId]);

  const morningDisabled  = conflictSet.has("morning")  || conflictSet.has("full_day");
  const eveningDisabled  = conflictSet.has("evening")  || conflictSet.has("full_day");
  const fullDayDisabled  = conflictSet.has("morning")  || conflictSet.has("evening") || conflictSet.has("full_day");
  const isFullyBlocked   = conflictSet.has("full_day") || (conflictSet.has("morning") && conflictSet.has("evening"));

  /* ── Maintenance block detection: any day in the booking range manually blocked ── */
  const maintenanceBlockNote = useMemo(() => {
    if (!bookingDate || !availabilityBlocks?.length) return null;
    const [sy, sm, sd] = bookingDate.split("-").map(Number);
    const duration = Math.max(1, durationDays);
    for (let i = 0; i < duration; i++) {
      const d = new Date(sy, sm - 1, sd + i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const av = availabilityBlocks.find((a) => a.dateStr === ds);
      if (av?.notes) return av.notes;
    }
    return null;
  }, [bookingDate, durationDays, availabilityBlocks]);

  // Auto-clear period if it becomes disabled
  useEffect(() => {
    if ((period === "morning" && morningDisabled) ||
        (period === "evening" && eveningDisabled) ||
        (period === "full_day" && fullDayDisabled)) {
      setPeriod("");
    }
  }, [morningDisabled, eveningDisabled, fullDayDisabled, period]);

  // Pre-fill date and chalet when opened from calendar click
  useEffect(() => {
    if (open && prefilledDate) setBookingDate(prefilledDate);
    if (open && prefilledChaletId) setSubmissionId(prefilledChaletId);
    if (!open) { setBookingDate(""); }
  }, [open, prefilledDate, prefilledChaletId]);

  const tp = totalPrice ? Math.round(Number(totalPrice)) : null;
  const dp = depositPaid ? Math.round(Number(depositPaid)) : null;
  const remainingBalance = tp !== null && dp !== null ? Math.max(0, tp - dp) : null;

  // Auto-fill client name + detect new/returning customer
  const handlePhoneBlur = async () => {
    const phone = clientPhone.trim();
    if (phone.length < 9) { setIsReturningCustomer(null); return; }
    setPhoneLoading(true);
    try {
      const r = await apiFetch(`/owner/bookings/lookup?phone=${encodeURIComponent(phone)}`);
      if (r.ok) {
        const data = await r.json();
        if (data?.clientName) {
          if (!clientName) setClientName(data.clientName);
          setIsReturningCustomer(true);
        } else {
          setIsReturningCustomer(false);
        }
      }
    } catch { /* silent */ } finally {
      setPhoneLoading(false);
    }
  };

  const reset = () => {
    setClientName(""); setClientPhone(""); setBookingDate(""); setDurationDays(1);
    setPeriod(""); setSource("external"); setSubmissionId(""); setNotes("");
    setTotalPrice(""); setDepositPaid(""); setInsuranceFee("");
    setIsReturningCustomer(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) { setError("يرجى إدخال اسم العميل"); return; }
    if (!clientPhone.trim()) { setError("يرجى إدخال رقم الجوال"); return; }
    if (!bookingDate) { setError("يرجى اختيار تاريخ الحجز"); return; }
    if (maintenanceBlockNote) { setError(`هذا اليوم غير متاح للحجز (صيانة/إغلاق مؤقت) — ${maintenanceBlockNote}`); return; }
    if (!period || period === "none") { setError("يرجى اختيار الفترة"); return; }
    if (!totalPrice) { setError("يرجى إدخال إجمالي قيمة الحجز"); return; }
    setSaving(true); setError("");
    try {
      const r = await apiFetch("/owner/bookings", {
        method: "POST",
        body: JSON.stringify({
          clientName,
          clientPhone: clientPhone || undefined,
          bookingDate,
          durationDays,
          period: period && period !== "none" ? period : undefined,
          source,
          notes: notes || undefined,
          submissionId: submissionId && submissionId !== "none" ? Number(submissionId) : undefined,
          totalPrice: totalPrice ? Math.round(Number(totalPrice)) : undefined,
          depositPaid: depositPaid ? Math.round(Number(depositPaid)) : undefined,
          insuranceFee: insuranceFee ? Math.round(Number(insuranceFee)) : undefined,
        }),
      });
      if (!r.ok) { setError("حدث خطأ، يرجى المحاولة مجدداً"); return; }
      onAdded();
      onClose();
      reset();
    } finally {
      setSaving(false);
    }
  };

  /* ── Derived display values ── */
  const selectedChalet = submissions.find((s: any) => String(s.id) === submissionId) ?? null;
  const bookingHijri = bookingDate ? formatDualDate(bookingDate).hijri.replace(/\s*هـ\s*$/, "") + " هـ" : null;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); reset(); } }}>
      <DialogContent dir="rtl" className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-right text-base">إضافة حجز يدوي</DialogTitle>
        </DialogHeader>

        {/* ── Chalet + Date header banner ── */}
        <div className="rounded-xl bg-primary/8 border border-primary/20 px-4 py-3 -mt-1 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-base">🏡</span>
            <span className="text-sm font-bold text-primary">
              {selectedChalet ? selectedChalet.nameAr : <span className="text-muted-foreground font-normal">لم يُحدَّد الشاليه بعد</span>}
            </span>
          </div>
          {bookingHijri && (
            <p className="text-xs text-muted-foreground font-medium pr-7">
              📅 {bookingHijri}
              {bookingDate && <span className="text-muted-foreground/60 mr-2">({formatDualDate(bookingDate).gregorian})</span>}
            </p>
          )}
          {!bookingHijri && (
            <p className="text-xs text-muted-foreground pr-7">اختر التاريخ أدناه لعرض التاريخ الهجري</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-1">

          {/* ── Chalet selector — REQUIRED, at top ── */}
          {submissions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">اسم الشاليه <span className="text-destructive">*</span></label>
              <Select value={submissionId} onValueChange={setSubmissionId}>
                <SelectTrigger><SelectValue placeholder="اختر الشاليه..." /></SelectTrigger>
                <SelectContent>
                  {submissions.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* ── Phone — required, Arabic numerals ── */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold">
                رقم الجوال <span className="text-destructive">*</span>
              </label>
              {isReturningCustomer === true && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  🔄 زبون سابق
                </span>
              )}
              {isReturningCustomer === false && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  🆕 زبون جديد
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                type="text"
                inputMode="numeric"
                value={toAr(clientPhone)}
                onChange={(e) => {
                  const raw = e.target.value
                    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                    .replace(/\D/g, "");
                  setClientPhone(raw);
                  setIsReturningCustomer(null);
                }}
                onBlur={handlePhoneBlur}
                placeholder="٠٥xxxxxxxx"
                className="text-right"
              />
              {phoneLoading && <span className="absolute left-3 top-2.5 text-xs text-muted-foreground animate-pulse">جاري البحث…</span>}
            </div>
          </div>

          {/* ── Client name — required ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">اسم العميل <span className="text-destructive">*</span></label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="اسم العميل الكريم" />
          </div>

          {/* ── Date + Duration ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">تاريخ الحجز <span className="text-destructive">*</span></label>
              <div className="rounded-md border bg-background px-3 py-2 text-sm min-h-[2.5rem] flex items-center">
                <DualCalendarPicker
                  value={bookingDate}
                  onChange={setBookingDate}
                  placeholder="اختر التاريخ"
                  minDate={new Date().toISOString().slice(0, 10)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">عدد الأيام</label>
              <Input
                type="text"
                inputMode="numeric"
                value={toAr(String(durationDays))}
                onChange={(e) => {
                  const raw = e.target.value
                    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                    .replace(/\D/g, "");
                  setDurationDays(Math.max(1, Number(raw) || 1));
                }}
              />
            </div>
          </div>

          {/* ── Maintenance block warning ── */}
          {maintenanceBlockNote && (
            <div className="flex items-start gap-2 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-300 dark:border-orange-700 px-3 py-2.5">
              <span className="text-base mt-0.5">🔧</span>
              <div>
                <p className="text-xs font-bold text-orange-800 dark:text-orange-300">هذا اليوم غير متاح للحجز (صيانة/إغلاق مؤقت)</p>
                <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">{maintenanceBlockNote}</p>
              </div>
            </div>
          )}

          {/* ── Period — required ── */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">الفترة الزمنية <span className="text-destructive">*</span></label>
            {isFullyBlocked && !maintenanceBlockNote && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                <span className="text-base">⛔</span>
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">هذا اليوم محجوز بالكامل — لا تتوفر فترات متاحة</span>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: "morning",  label: "صباحي",     sub: "الفترة الصباحية",  disabled: morningDisabled,  icon: "🌅" },
                { value: "evening",  label: "مسائي",     sub: "الفترة المسائية",  disabled: eveningDisabled,  icon: "🌙" },
                { value: "full_day", label: "يوم كامل",  sub: "يوم كامل",         disabled: fullDayDisabled,  icon: "☀️" },
              ] as const).map(({ value, label, sub, disabled, icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPeriod(value)}
                  className={[
                    "relative flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-start transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-primary/40",
                    disabled
                      ? "opacity-50 cursor-not-allowed bg-muted/40 border-border"
                      : period === value
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:border-primary/50 hover:bg-muted/30",
                  ].join(" ")}
                >
                  <span className="text-sm font-semibold flex items-center gap-1">
                    {icon && <span>{icon}</span>}
                    {label}
                    {disabled && <span className="text-[10px] font-bold text-red-500 dark:text-red-400 mr-1">(محجوز)</span>}
                  </span>
                  {(value as string) !== "none" && (
                    <span className="text-[10px] text-muted-foreground leading-none">{sub}</span>
                  )}
                  {period === value && !disabled && (
                    <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Financial Fields — إجمالي required ── */}
          <div className="bg-muted/40 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">تفاصيل المبالغ</p>
            {activeSeason && (() => {
              /* Per-day price takes priority over season-level price */
              const dayDP = activeSeason.dailyPrices?.[bookingDate ?? ""] ?? null;
              const morningP = dayDP?.morning ?? (activeSeason.priceMorning ? Number(activeSeason.priceMorning) : null);
              const eveningP = dayDP?.evening ?? (activeSeason.priceEvening ? Number(activeSeason.priceEvening) : null);
              const fullDayP = dayDP?.fullDay ?? (activeSeason.priceFullDay ? Number(activeSeason.priceFullDay) : null);
              const seasonPrice =
                period === "morning" && morningP != null ? morningP :
                period === "evening" && eveningP != null ? eveningP :
                (period === "full_day" || period === "all") && fullDayP != null ? fullDayP :
                null;
              const hasDailyOverride = !!dayDP && Object.keys(dayDP).length > 0;
              return (
                <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Sun className="w-4 h-4 text-amber-500 shrink-0" />
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 flex-1">موسم: {activeSeason.nameAr}</p>
                    {hasDailyOverride && <span className="text-[10px] bg-amber-200 dark:bg-amber-800/50 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-full">سعر هذا اليوم</span>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
                    {morningP != null && <span>☀️ صباحي: <span className="font-semibold">{toAr(morningP)} ر.س</span></span>}
                    {eveningP != null && <span>🌙 مسائي: <span className="font-semibold">{toAr(eveningP)} ر.س</span></span>}
                    {fullDayP != null && <span>📅 يوم كامل: <span className="font-semibold">{toAr(fullDayP)} ر.س</span></span>}
                  </div>
                  {seasonPrice != null && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 w-full"
                      onClick={() => setTotalPrice(String(seasonPrice))}
                    >
                      تطبيق السعر الموسمي للفترة المحددة
                    </Button>
                  )}
                </div>
              );
            })()}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">
                  إجمالي قيمة الحجز (ر.س) <span className="text-destructive">*</span>
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={toAr(totalPrice)}
                  onChange={(e) => setTotalPrice(
                    e.target.value
                      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                      .replace(/\D/g, "")
                  )}
                  placeholder="٠"
                  className="text-right"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">العربون المدفوع (ر.س)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={toAr(depositPaid)}
                  onChange={(e) => setDepositPaid(
                    e.target.value
                      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                      .replace(/\D/g, "")
                  )}
                  placeholder="٠"
                  className="text-right"
                />
              </div>
            </div>
            {remainingBalance !== null && (
              <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">المبلغ المتبقي:</span>
                <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{remainingBalance.toLocaleString("ar-SA")} ر.س</span>
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">مبلغ التأمين (ر.س) — قابل للإعادة</label>
              <Input
                type="text"
                inputMode="numeric"
                value={toAr(insuranceFee)}
                onChange={(e) => setInsuranceFee(
                  e.target.value
                    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                    .replace(/\D/g, "")
                )}
                placeholder="٠"
                className="text-right"
              />
            </div>
          </div>

          {/* ── Source ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">مصدر الحجز</label>
            <Select value={source} onValueChange={(v) => setSource(v as "platform" | "external")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="external">من خارج المنصة (واتساب / انستقرام)</SelectItem>
                <SelectItem value="platform">عن طريق المنصة</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── Notes — optional ── */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">ملاحظات <span className="text-xs font-normal text-muted-foreground">(اختياري)</span></label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." />
          </div>

          {error && <p className="text-sm text-destructive font-medium">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ الحجز"}
            </Button>
            <Button type="button" variant="outline" onClick={() => { onClose(); reset(); }}>إلغاء</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Proof Viewer Dialog ───────────────────────────────── */
function ProofViewerDialog({
  booking,
  open,
  onClose,
}: {
  booking: OwnerBooking | null;
  open: boolean;
  onClose: () => void;
}) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  if (!booking) return null;
  const images: string[] = (() => {
    try { return JSON.parse(booking.insuranceProofImages ?? "[]"); } catch { return []; }
  })();

  const fullUrl = (url: string) =>
    url.startsWith("http") ? url : `${window.location.origin}${BASE}${url}`;

  return (
    <>
      <Dialog open={open && !lightbox} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">📸 إثبات التلفيات — {booking.clientName}</DialogTitle>
            {booking.insuranceDeductReason && (
              <div className="text-sm text-muted-foreground mt-1">السبب: {booking.insuranceDeductReason}</div>
            )}
          </DialogHeader>
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">لا توجد صور مرفقة</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto">
              {images.map((url, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setLightbox(fullUrl(url))}
                  className="relative rounded-lg overflow-hidden aspect-square bg-muted hover:opacity-90 transition"
                >
                  <img
                    src={fullUrl(url)}
                    alt={`إثبات ${i + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {toAr(i + 1)} / {toAr(images.length)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightbox && (
        <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black/95 border-0">
            <button
              type="button"
              onClick={() => setLightbox(null)}
              className="absolute top-2 left-2 z-50 text-white bg-black/60 rounded-full w-8 h-8 flex items-center justify-center text-lg"
            >✕</button>
            <img src={lightbox} alt="proof" className="w-full max-h-[80vh] object-contain rounded" />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ── Manage Insurance Dialog ───────────────────────── */
function ManageInsuranceDialog({
  booking,
  open,
  onClose,
  onSaved,
  apiFetch,
  formatAmount,
}: {
  booking: OwnerBooking | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  apiFetch: (url: string, opts?: RequestInit) => Promise<Response>;
  formatAmount: (v: string | number | null | undefined) => string;
}) {
  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [mode, setMode] = useState<"choose" | "refund" | "deduct">("choose");
  const [deductAmount, setDeductAmount] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [proofImages, setProofImages] = useState<string[]>([]);      // uploaded URLs
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMode("choose"); setDeductAmount(""); setDeductReason("");
      setProofImages([]); setUploading(false); setSaving(false);
    }
  }, [open]);

  if (!booking) return null;

  const insurance = Number(booking.insuranceFee ?? 0);
  const deductVal = Math.round(Number(deductAmount) || 0);
  const remaining = Math.max(0, insurance - deductVal);

  const handleUploadImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(`${BASE}/api/storage/uploads/process`, {
          method: "POST", credentials: "include", body: fd,
        });
        if (r.ok) {
          const data = await r.json();
          if (data?.url) uploaded.push(data.url);
        }
      } catch { /* skip failed */ }
    }
    setProofImages(prev => [...prev, ...uploaded]);
    setUploading(false);
  };

  const removeProofImage = (url: string) =>
    setProofImages(prev => prev.filter(u => u !== url));

  const fullUrl = (url: string) =>
    url.startsWith("http") ? url : `${window.location.origin}${BASE}${url}`;

  const handleFullRefund = async () => {
    setSaving(true);
    await apiFetch(`/owner/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ insuranceRefunded: true, insuranceDeducted: 0, insuranceDeductReason: null }),
    });
    onSaved(); onClose();
  };

  const handleDeduct = async () => {
    if (deductVal <= 0 || deductVal > insurance) return;
    setSaving(true);
    await apiFetch(`/owner/bookings/${booking.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        insuranceRefunded: true,
        insuranceDeducted: deductVal,
        insuranceDeductReason: deductReason || undefined,
        insuranceProofImages: proofImages,
      }),
    });
    onSaved(); onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            🔒 إدارة التأمين — {booking.clientName}
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            مبلغ التأمين: <span className="font-bold text-orange-600">{formatAmount(booking.insuranceFee)}</span>
          </div>
        </DialogHeader>

        {mode === "choose" && (
          <div className="flex flex-col gap-3 py-2">
            <button
              onClick={() => setMode("refund")}
              className="w-full rounded-lg border-2 border-green-200 bg-green-50 p-4 text-right hover:bg-green-100 transition"
            >
              <div className="font-bold text-green-700">✅ إرجاع بالكامل</div>
              <div className="text-sm text-green-600 mt-1">إعادة كامل مبلغ التأمين للعميل دون أي خصم</div>
            </button>
            <button
              onClick={() => setMode("deduct")}
              className="w-full rounded-lg border-2 border-red-200 bg-red-50 p-4 text-right hover:bg-red-100 transition"
            >
              <div className="font-bold text-red-700">✂️ خصم من التأمين</div>
              <div className="text-sm text-red-600 mt-1">خصم مبلغ بسبب تلفيات مع رفع صور الإثبات</div>
            </button>
          </div>
        )}

        {mode === "refund" && (
          <div className="flex flex-col gap-4 py-2">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-center">
              <div className="text-2xl font-bold text-green-700">{formatAmount(booking.insuranceFee)}</div>
              <div className="text-sm text-green-600 mt-1">سيتم إرجاع كامل مبلغ التأمين للعميل</div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("choose")} disabled={saving}>رجوع</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleFullRefund} disabled={saving}>
                {saving ? "جاري الحفظ..." : "✅ تأكيد الإرجاع"}
              </Button>
            </div>
          </div>
        )}

        {mode === "deduct" && (
          <div className="flex flex-col gap-3 py-2">
            {/* Amount preview */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                <div className="text-xs text-red-500">المخصوم (تلفيات)</div>
                <div className="text-xl font-bold text-red-700">{formatAmount(deductVal)}</div>
              </div>
              <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                <div className="text-xs text-green-500">المُرجَع للعميل</div>
                <div className="text-xl font-bold text-green-700">{formatAmount(remaining)}</div>
              </div>
            </div>

            {/* Deduction amount */}
            <div>
              <label className="block text-sm font-medium mb-1">المبلغ المخصوم (ر.س)</label>
              <input
                type="number" min="0" max={insurance} step="1" inputMode="numeric"
                value={deductAmount}
                onChange={e => setDeductAmount(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-left text-base"
                placeholder={`أقصى مبلغ: ${insurance}`}
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-sm font-medium mb-1">سبب الخصم</label>
              <input
                type="text"
                value={deductReason}
                onChange={e => setDeductReason(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-base"
                placeholder="مثال: كسر أثاث، تلف فعلي..."
              />
            </div>

            {/* Image upload */}
            <div>
              <label className="block text-sm font-medium mb-2">📸 صور الإثبات (اختياري)</label>

              {/* Thumbnail grid */}
              {proofImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-2">
                  {proofImages.map((url, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden aspect-square bg-muted">
                      <img src={fullUrl(url)} alt={`صورة ${i + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeProofImage(url)}
                        className="absolute top-0.5 left-0.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs leading-none"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Upload button */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={e => handleUploadImages(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="w-full border-2 border-dashed border-muted-foreground/30 rounded-lg py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition disabled:opacity-50"
              >
                {uploading
                  ? "⏳ جاري الرفع..."
                  : proofImages.length > 0
                    ? `📎 إضافة المزيد من الصور (${toAr(proofImages.length)} مُرفق)`
                    : "📎 انقر لرفع صور الإثبات"}
              </button>
            </div>

            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700">
              ⚠️ المبلغ المخصوم سيُضاف تلقائياً كإيراد تحت فئة <strong>تلفيات</strong> في التقارير الشهرية.
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setMode("choose")} disabled={saving}>رجوع</Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleDeduct}
                disabled={saving || uploading || deductVal <= 0 || deductVal > insurance}
              >
                {saving ? "جاري الحفظ..." : "✂️ تأكيد الخصم"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ── Block Date Dialog ───────────────────────── */
function BlockDateDialog({
  open, onClose, dateStr, chaletId, existing, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  dateStr: string;
  chaletId: number;
  existing?: ChaletAvailability | null;
  onSaved: () => void;
}) {
  const [morning, setMorning] = useState(existing?.periodMorning ?? false);
  const [evening, setEvening] = useState(existing?.periodEvening ?? false);
  const [fullDay, setFullDay] = useState(existing?.periodFullDay ?? false);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMorning(existing?.periodMorning ?? false);
    setEvening(existing?.periodEvening ?? false);
    setFullDay(existing?.periodFullDay ?? false);
    setNotes(existing?.notes ?? "");
  }, [existing, open]);

  const handleSave = async () => {
    if (!morning && !evening && !fullDay) {
      if (existing) {
        await apiFetch(`/owner/availability/${existing.id}`, { method: "DELETE" });
      }
      onSaved(); onClose(); return;
    }
    setSaving(true);
    try {
      await apiFetch("/owner/availability", {
        method: "POST",
        body: JSON.stringify({ chaletId, dateStr, periodMorning: morning, periodEvening: evening, periodFullDay: fullDay, notes: notes || undefined }),
      });
      onSaved(); onClose();
    } finally {
      setSaving(false);
    }
  };

  const labelDate = new Date(dateStr + "T12:00:00").toLocaleDateString("ar-SA", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-right text-base font-bold">ضبط إتاحة اليوم</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <p className="text-sm text-muted-foreground">{labelDate}</p>
          <p className="text-xs text-foreground font-medium">حدد الفترات المحجوزة (غير المتاحة):</p>
          <div className="space-y-3">
            {[
              { key: "morning" as const,  label: "🌅 صباحي",     state: morning,  set: setMorning },
              { key: "evening" as const,  label: "🌙 مسائي",     state: evening,  set: setEvening },
              { key: "full_day" as const, label: "☀️ يوم كامل",  state: fullDay,  set: setFullDay },
            ].map(({ label, state, set }) => (
              <label key={label} className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => set(!state)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer ${
                    state ? "bg-destructive border-destructive" : "border-border group-hover:border-destructive/50"
                  }`}
                >
                  {state && <XCircle className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-sm font-medium">{label} — محجوز</span>
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">ملاحظة (اختياري)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="مثال: حفلة عائلية" className="text-sm" />
          </div>
          <div className="flex gap-3 pt-1">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
          </div>
          {!morning && !evening && !fullDay && existing && (
            <p className="text-xs text-center text-muted-foreground">إلغاء تحديد جميع الفترات سيحذف تاريخ الحجب.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Mini Calendar ───────────────────────────── */
const _hijriFmt     = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { day: "numeric" });
const _hijriMFmt    = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { month: "long" });
const _hijriYFmt    = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric" });
const _getFirstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

function MiniCalendar({
  year, month, availability, bookings, onDateClick,
}: {
  year: number;
  month: number;
  availability: ChaletAvailability[];
  bookings: OwnerBooking[];
  onDateClick: (dateStr: string) => void;
}) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfMonth = new Date(year, month - 1, 1).getDay();
  const arabicDays = ["أح", "إث", "ثل", "أر", "خم", "جم", "سب"];

  const availMap = useMemo(() => {
    const m = new Map<string, ChaletAvailability>();
    for (const a of availability) m.set(a.dateStr, a);
    return m;
  }, [availability]);

  /* Map actual DB bookings → period → guestName, expanded across durationDays */
  const bookingMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const b of bookings) {
      if (!b.bookingDate) continue;
      const duration = Math.max(1, b.durationDays ?? 1);
      const period = b.period ?? "full_day";
      const [sy, sm, sd] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < duration; i++) {
        const d = new Date(sy, sm - 1, sd + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (!m.has(ds)) m.set(ds, new Map());
        m.get(ds)!.set(period, b.clientName ?? "");
      }
    }
    return m;
  }, [bookings]);

  const today = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="select-none rounded-xl overflow-hidden border border-border">
      {/* Unified grid: header row + day cells */}
      <div className="grid grid-cols-7 gap-px bg-border">
        {/* Day-of-week headers */}
        {arabicDays.map((d) => (
          <div key={d} className="bg-muted/60 text-center text-[10px] font-bold text-muted-foreground py-2">{d}</div>
        ))}

        {/* Day cells */}
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} className="bg-background/60 min-h-[62px]" />;

          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const avEntry = availMap.get(dateStr);
          const bkEntry = bookingMap.get(dateStr); // Map<period, guestName>

          /* Resolve per-period blocked state + guest names */
          const morningGuest = bkEntry?.get("morning") ?? (avEntry?.periodMorning ? null : undefined);
          const eveningGuest = bkEntry?.get("evening") ?? (avEntry?.periodEvening ? null : undefined);
          const fullDayGuest = bkEntry?.get("full_day") ?? (avEntry?.periodFullDay ? null : undefined);

          const morningBlocked = morningGuest !== undefined;
          const eveningBlocked = eveningGuest !== undefined;
          const fullDayBlocked = fullDayGuest !== undefined;
          const isBlocked = morningBlocked || eveningBlocked || fullDayBlocked;
          const isPartial = isBlocked && !fullDayBlocked && (morningBlocked !== eveningBlocked);
          const isToday = dateStr === today;
          /* Manual maintenance block: avEntry has notes and NO real booking on this day */
          const isManualBlock = !!avEntry?.notes && (!bkEntry || bkEntry.size === 0);

          /* Hijri day number */
          const hijriDay = _hijriFmt.format(new Date(year, month - 1, day));

          /* Build per-period rows for display */
          type PRow = { label: string; guest: string; amber: boolean };
          const pRows: PRow[] = [];
          if (!isManualBlock) {
            if (fullDayBlocked) {
              pRows.push({ label: "يوم كامل", guest: fullDayGuest ? _getFirstName(fullDayGuest) : "", amber: false });
            } else {
              if (morningBlocked) pRows.push({ label: "صباحي", guest: morningGuest ? _getFirstName(morningGuest) : "", amber: true });
              if (eveningBlocked) pRows.push({ label: "مسائي", guest: eveningGuest ? _getFirstName(eveningGuest) : "", amber: true });
            }
          }

          return (
            <button
              key={dateStr}
              onClick={() => onDateClick(dateStr)}
              className={[
                "flex flex-col items-center justify-start pt-1.5 pb-1.5 px-0.5 w-full",
                "transition-colors focus:outline-none focus:z-10 focus:ring-2 focus:ring-inset focus:ring-primary/60",
                "min-h-[66px]",
                isManualBlock
                  ? "bg-gray-200 dark:bg-gray-700/60 text-gray-600 dark:text-gray-300"
                  : isBlocked
                    ? isPartial
                      ? "bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100"
                      : "bg-red-100 dark:bg-red-900/50 text-red-900 dark:text-red-100"
                    : "bg-background hover:bg-primary/5 text-foreground",
                isToday ? "ring-2 ring-inset ring-primary" : "",
              ].join(" ")}
            >
              {/* Hijri day */}
              <span className="text-[0.82rem] font-bold leading-none">{hijriDay}</span>
              {/* Gregorian day */}
              <span className={`text-[0.52rem] leading-none mt-0.5 tabular-nums ${isBlocked || isManualBlock ? "opacity-60" : "text-muted-foreground"}`}>{day}</span>

              {/* Manual block label */}
              {isManualBlock && (
                <span className="mt-0.5 text-[0.42rem] font-bold leading-none text-gray-500 dark:text-gray-400 text-center">
                  🔧 {avEntry!.notes!.length > 8 ? avEntry!.notes!.slice(0, 7) + "…" : avEntry!.notes}
                </span>
              )}

              {/* Per-period rows — shown independently */}
              {pRows.length > 0 && (
                <div className="mt-1 w-full flex flex-col items-center gap-[2px]">
                  {pRows.map((row, ri) => (
                    <div key={ri} className="w-full flex flex-col items-center">
                      <span className={`text-[0.44rem] font-bold leading-none text-center ${
                        row.amber ? "text-amber-800 dark:text-amber-200" : "text-red-800 dark:text-red-200"
                      }`}>{row.label}</span>
                      {row.guest && (
                        <span className={`text-[0.42rem] leading-none truncate w-full text-center font-medium ${
                          row.amber ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"
                        }`}>{row.guest}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Delete Confirm Dialog ───────────────────── */
function DeleteConfirmDialog({
  open, booking, onClose, onConfirm,
}: {
  open: boolean;
  booking: OwnerBooking | null;
  onClose: () => void;
  onConfirm: (id: number, reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => { if (!open) setReason(""); }, [open]);
  if (!booking) return null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>إلغاء الحجز</DialogTitle>
          <DialogDescription>
            سيتم إلغاء حجز <strong>{booking.clientName}</strong>. يمكنك استعادته من قسم "الحجوزات الملغاة" في أي وقت.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-1">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">سبب الإلغاء *</label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: طلب العميل الإلغاء، تعارض في المواعيد..."
              rows={3}
            />
          </div>
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>تراجع</Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={!reason.trim()}
            onClick={() => { onConfirm(booking.id, reason.trim()); onClose(); }}
          >
            تأكيد الإلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Reschedule Dialog ───────────────────────── */
function RescheduleDialog({
  open, booking, existingBookings, onClose, onRescheduled,
}: {
  open: boolean;
  booking: OwnerBooking | null;
  existingBookings: OwnerBooking[];
  onClose: () => void;
  onRescheduled: () => void;
}) {
  const [newDate, setNewDate] = useState("");
  const [newDuration, setNewDuration] = useState(1);
  const [newPeriod, setNewPeriod] = useState<string>("none");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && booking) {
      setNewDate(booking.bookingDate);
      setNewDuration(Math.max(1, booking.durationDays ?? 1));
      setNewPeriod(booking.period ?? "none");
      setReason("");
      setError("");
    }
  }, [open, booking]);

  /* ── Conflict detection (mirrors AddBookingDialog, excludes self) ── */
  const conflictSet = useMemo(() => {
    const blocked = new Set<string>();
    if (!newDate || !booking) return blocked;
    const [sy, sm, sd] = newDate.split("-").map(Number);
    const dur = Math.max(1, newDuration);
    const rangeDates = new Set<string>();
    for (let i = 0; i < dur; i++) {
      const d = new Date(sy, sm - 1, sd + i);
      rangeDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    for (const b of existingBookings) {
      if (!b.bookingDate || b.id === booking.id) continue; // exclude self
      if (booking.submissionId && b.submissionId !== booking.submissionId) continue;
      const bDur = Math.max(1, b.durationDays ?? 1);
      const [by, bm, bd2] = b.bookingDate.split("-").map(Number);
      for (let i = 0; i < bDur; i++) {
        const d = new Date(by, bm - 1, bd2 + i);
        const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        if (rangeDates.has(ds)) blocked.add(b.period ?? "full_day");
      }
    }
    return blocked;
  }, [newDate, newDuration, existingBookings, booking]);

  const morningDisabled  = conflictSet.has("morning")  || conflictSet.has("full_day");
  const eveningDisabled  = conflictSet.has("evening")  || conflictSet.has("full_day");
  const fullDayDisabled  = conflictSet.has("morning")  || conflictSet.has("evening") || conflictSet.has("full_day");
  const isFullyBlocked   = conflictSet.has("full_day") || (conflictSet.has("morning") && conflictSet.has("evening"));

  // Auto-clear period if the chosen slot becomes unavailable
  useEffect(() => {
    if ((newPeriod === "morning" && morningDisabled) ||
        (newPeriod === "evening" && eveningDisabled) ||
        (newPeriod === "full_day" && fullDayDisabled)) {
      setNewPeriod("none");
    }
  }, [morningDisabled, eveningDisabled, fullDayDisabled, newPeriod]);

  // Derive whether the current selection conflicts
  const selectedPeriodBlocked =
    (newPeriod === "morning" && morningDisabled) ||
    (newPeriod === "evening" && eveningDisabled) ||
    (newPeriod === "full_day" && fullDayDisabled);
  const hasConflict = isFullyBlocked || selectedPeriodBlocked;

  if (!booking) return null;

  const handleSave = async () => {
    if (!newDate) { setError("يرجى تحديد تاريخ"); return; }
    if (!reason.trim()) { setError("يرجى كتابة سبب إعادة الجدولة"); return; }
    if (hasConflict) { setError(isFullyBlocked ? "هذا اليوم محجوز بالكامل" : "هذه الفترة محجوزة — يرجى اختيار فترة أخرى"); return; }
    setSaving(true); setError("");
    try {
      const r = await apiFetch(`/owner/bookings/${booking.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          bookingDate: newDate,
          durationDays: newDuration,
          period: newPeriod && newPeriod !== "none" ? newPeriod : null,
          rescheduleReason: reason.trim(),
        }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        setError(data?.error ?? "حدث خطأ، يرجى المحاولة");
        return;
      }
      onRescheduled();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إعادة جدولة الحجز</DialogTitle>
          <DialogDescription>تعديل موعد حجز {booking.clientName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">تاريخ الحجز الجديد</label>
            <div className="rounded-md border bg-background px-3 py-2 flex items-center">
              <DualCalendarPicker value={newDate} onChange={setNewDate} placeholder="اختر التاريخ" />
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">عدد الأيام</label>
            <Input type="number" min={1} value={newDuration} onChange={(e) => setNewDuration(Math.max(1, Number(e.target.value)))} />
          </div>

          {/* Period — smart radio buttons with conflict badges */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">الفترة</label>

            {/* Fully-blocked day warning */}
            {isFullyBlocked && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
                <span className="text-base">⛔</span>
                <span className="text-xs font-semibold text-red-700 dark:text-red-300">هذا اليوم محجوز بالكامل — لا تتوفر فترات متاحة</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "none",     label: "—",         sub: "بدون تحديد",     disabled: false,           icon: ""   },
                { value: "morning",  label: "صباحي",     sub: "الفترة الصباحية", disabled: morningDisabled,  icon: "🌅" },
                { value: "evening",  label: "مسائي",     sub: "الفترة المسائية", disabled: eveningDisabled,  icon: "🌙" },
                { value: "full_day", label: "يوم كامل",  sub: "يوم كامل",       disabled: fullDayDisabled,  icon: "☀️" },
              ] as const).map(({ value, label, sub, disabled, icon }) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => !disabled && setNewPeriod(value)}
                  className={[
                    "relative flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2.5 text-start transition-all",
                    "focus:outline-none focus:ring-2 focus:ring-primary/40",
                    disabled
                      ? "opacity-50 cursor-not-allowed bg-muted/40 border-border"
                      : newPeriod === value
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border hover:border-primary/50 hover:bg-muted/30",
                  ].join(" ")}
                >
                  <span className="text-sm font-semibold flex items-center gap-1">
                    {icon && <span>{icon}</span>}
                    {label}
                    {disabled && (
                      <span className="text-[10px] font-bold text-red-500 dark:text-red-400 mr-1">(محجوز)</span>
                    )}
                  </span>
                  {(value as string) !== "none" && (
                    <span className="text-[10px] text-muted-foreground leading-none">{sub}</span>
                  )}
                  {newPeriod === value && !disabled && (
                    <span className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">سبب إعادة الجدولة <span className="text-destructive">*</span></label>
            <Textarea
              placeholder="مثال: طلب العميل تأجيل الموعد بسبب..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2">
              <span className="text-base mt-0.5">⛔</span>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>إلغاء</Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !reason.trim() || hasConflict || isFullyBlocked}
          >
            {saving ? "جاري الحفظ..." : "حفظ التعديل"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Booking Calendar Tab ────────────────────── */
function BookingCalendarTab({ submissions }: { submissions: any[] }) {
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [prefilledDate, setPrefilledDate] = useState<string | null>(null);
  const [selectedChaletId, setSelectedChaletId] = useState<number | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [blockDateStr, setBlockDateStr] = useState<string | null>(null);
  const [summaryDate, setSummaryDate] = useState<string | null>(null);
  const [reviewSentIds, setReviewSentIds] = useState<Set<number>>(new Set());
  const [reviewPendingId, setReviewPendingId] = useState<number | null>(null);
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [deleteDialogBooking, setDeleteDialogBooking] = useState<OwnerBooking | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<OwnerBooking | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [archiveTab, setArchiveTab] = useState<"cancelled" | "rescheduled">("cancelled");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: ownerChalets = [], isLoading: chaletsLoading } = useQuery<any[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/page-content`);
      if (!r.ok) return {};
      const rows: { key: string; value: string }[] = await r.json();
      return Object.fromEntries(rows.map((x) => [x.key, x.value]));
    },
    staleTime: 5 * 60 * 1000,
  });

  const activeChaletId = selectedChaletId ?? ownerChalets[0]?.id ?? null;

  /* ── Build WhatsApp review message from template ── */
  const DEFAULT_WA_REVIEW = "أهلاً {guest_name}، يسعدنا تقييمك لتجربتك في {chalet_name} 🌟\nاضغط هنا لتقييمك: {link}";
  function buildReviewMessage(guestName: string, chaletName: string, link: string): string {
    const chalet = ownerChalets.find((c: any) => c.id === activeChaletId);
    const tpl =
      (chalet?.waReviewTemplate as string | null | undefined) ??
      siteSettings.wa_review_template ??
      DEFAULT_WA_REVIEW;
    return tpl
      .replace(/\{link\}/g, link)
      .replace(/\{guest_name\}/g, guestName)
      .replace(/\{chalet_name\}/g, chaletName);
  }

  /* ── Send review invite via WhatsApp ── */
  async function sendReviewRequest(b: OwnerBooking) {
    if (!activeChaletId) return;
    setReviewPendingId(b.id);
    try {
      const r = await apiFetch("/owner/review-invite", {
        method: "POST",
        body: JSON.stringify({ chaletId: activeChaletId, guestName: b.clientName, bookingId: b.id }),
      });
      if (!r.ok) return;
      const data = await r.json();
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const link = `${window.location.origin}${base}/r/${data.token}`;
      const chaletName = ownerChalets.find((c: any) => c.submissionId === b.submissionId)?.nameAr
        ?? ownerChalets.find((c: any) => c.id === activeChaletId)?.nameAr
        ?? "شاليهنا";
      const msg = buildReviewMessage(b.clientName ?? "", chaletName, link);
      let rawPhone = b.clientPhone?.replace(/\D/g, "") ?? "";
      if (rawPhone.startsWith("00")) rawPhone = rawPhone.slice(2);
      if (rawPhone.startsWith("0")) rawPhone = "966" + rawPhone.slice(1);
      const a = document.createElement("a");
      a.href = `https://wa.me/${rawPhone || ""}?text=${encodeURIComponent(msg)}`;
      a.target = "_blank"; a.rel = "noopener noreferrer";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setReviewSentIds((prev) => new Set([...prev, b.id]));
      toast({ title: "تم إرسال طلب التقييم ✓", description: `تم فتح واتساب لإرسال رابط التقييم إلى ${b.clientName}` });
    } finally {
      setReviewPendingId(null);
    }
  }

  const { data: availability = [], isLoading: availLoading } = useQuery<ChaletAvailability[]>({
    queryKey: ["owner", "availability", activeChaletId],
    queryFn: async () => {
      if (!activeChaletId) return [];
      const r = await apiFetch(`/owner/availability?chaletId=${activeChaletId}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeChaletId,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const [insuranceTarget, setInsuranceTarget] = useState<OwnerBooking | null>(null);
  const [proofTarget, setProofTarget] = useState<OwnerBooking | null>(null);

  /* ── Booking stats (always-enabled for summary cards) ── */
  const { data: bookingStats } = useQuery<{
    activeCurrentMonth: number;
    revenueCurrentMonth: number;
    totalActive: number;
    totalCancelled: number;
    totalRescheduled: number;
  } | null>({
    queryKey: ["owner", "bookings", "stats"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings/stats");
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const activeChalet = ownerChalets.find((c: any) => c.id === activeChaletId) as any | undefined;
  const [morningCheckIn, setMorningCheckIn] = useState<string>("");
  const [morningCheckOut, setMorningCheckOut] = useState<string>("");
  const [eveningCheckIn, setEveningCheckIn] = useState<string>("");
  const [eveningCheckOut, setEveningCheckOut] = useState<string>("");
  const [fullDayCheckIn, setFullDayCheckIn] = useState<string>("");
  const [fullDayCheckOut, setFullDayCheckOut] = useState<string>("");
  const [savingTimes, setSavingTimes] = useState(false);
  const [timesSaved, setTimesSaved] = useState(false);

  // Sync fields when active chalet changes
  const prevChaletRef = useRef<number | null>(null);
  if (activeChaletId !== prevChaletRef.current) {
    prevChaletRef.current = activeChaletId;
    setMorningCheckIn(activeChalet?.morningCheckIn ?? "");
    setMorningCheckOut(activeChalet?.morningCheckOut ?? "");
    setEveningCheckIn(activeChalet?.eveningCheckIn ?? "");
    setEveningCheckOut(activeChalet?.eveningCheckOut ?? "");
    setFullDayCheckIn(activeChalet?.fullDayCheckIn ?? "");
    setFullDayCheckOut(activeChalet?.fullDayCheckOut ?? "");
    setTimesSaved(false);
  }

  const saveTimes = async () => {
    if (!activeChaletId) return;
    setSavingTimes(true);
    try {
      await apiFetch(`/owner/chalets/${activeChaletId}/times`, {
        method: "PATCH",
        body: JSON.stringify({
          morningCheckIn: morningCheckIn.trim() || null,
          morningCheckOut: morningCheckOut.trim() || null,
          eveningCheckIn: eveningCheckIn.trim() || null,
          eveningCheckOut: eveningCheckOut.trim() || null,
          fullDayCheckIn: fullDayCheckIn.trim() || null,
          fullDayCheckOut: fullDayCheckOut.trim() || null,
        }),
      });
      await qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
      setTimesSaved(true);
      setTimeout(() => setTimesSaved(false), 3000);
    } finally {
      setSavingTimes(false);
    }
  };

  const { data: cancelledBookings = [] } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings", "cancelled"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings/cancelled");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: showArchive && archiveTab === "cancelled",
  });

  const { data: rescheduleLog = [] } = useQuery<RescheduleLogItem[]>({
    queryKey: ["owner", "bookings", "reschedule-log"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings/reschedule-log");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: showArchive && archiveTab === "rescheduled",
  });

  const deleteBooking = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason: string }) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "DELETE", body: JSON.stringify({ reason }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings", "cancelled"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings", "stats"] });
      toast({ title: "تم إلغاء الحجز", description: "تم نقل الحجز إلى الأرشيف بنجاح." });
    },
  });

  const restoreBooking = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ restore: true }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings", "cancelled"] });
      qc.invalidateQueries({ queryKey: ["owner", "bookings", "stats"] });
      toast({ title: "تمت استعادة الحجز", description: "تم إعادة الحجز إلى القائمة النشطة." });
    },
  });

  const patchBookingStatus = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: { balanceCollected?: boolean; insuranceRefunded?: boolean } }) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "bookings"] }),
  });

  const calAvailability = useMemo(() => {
    return availability.filter((a) => {
      const [y, m] = a.dateStr.split("-").map(Number);
      return y === calYear && m === calMonth;
    });
  }, [availability, calYear, calMonth]);

  /* Filter bookings whose range OVERLAPS with the current calendar month (fixes multi-day cross-month display) */
  const calBookings = useMemo(() => {
    if (!activeChalet) return [];
    const lastDay = new Date(calYear, calMonth, 0).getDate();
    const monthStart = `${calYear}-${String(calMonth).padStart(2, "0")}-01`;
    const monthEnd   = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    return bookings.filter((b) => {
      if (!b.bookingDate) return false;
      if (b.submissionId !== activeChalet.submissionId) return false;
      const [by, bm, bd] = b.bookingDate.split("-").map(Number);
      const dur = Math.max(1, b.durationDays ?? 1);
      const bEndDate = new Date(by, bm - 1, bd + dur - 1);
      const bEnd = `${bEndDate.getFullYear()}-${String(bEndDate.getMonth() + 1).padStart(2, "0")}-${String(bEndDate.getDate()).padStart(2, "0")}`;
      return b.bookingDate <= monthEnd && bEnd >= monthStart;
    });
  }, [bookings, activeChalet, calYear, calMonth]);

  const blockEntry = blockDateStr ? availability.find((a) => a.dateStr === blockDateStr) ?? null : null;

  const _calFirstDay = new Date(calYear, calMonth - 1, 1);
  const _calLastDay  = new Date(calYear, calMonth, 0);
  const _hmFirst     = _hijriMFmt.format(_calFirstDay);
  const _hmLast      = _hijriMFmt.format(_calLastDay);
  const _hyLast      = _hijriYFmt.format(_calLastDay);
  const monthLabelHijri = _hmFirst === _hmLast
    ? `${_hmFirst} ${_hyLast}`
    : `${_hmFirst} - ${_hmLast} ${_hyLast}`;
  const monthLabelGreg = _calFirstDay.toLocaleDateString("ar-SA", { year: "numeric", month: "long", calendar: "gregory" });
  const monthLabel = `${monthLabelHijri} · ${monthLabelGreg}`;

  const filteredBookings = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookings.filter((b) => {
      if (filterFrom && b.bookingDate < filterFrom) return false;
      if (filterTo && b.bookingDate > filterTo) return false;
      if (q) {
        const nameMatch = b.clientName?.toLowerCase().includes(q);
        const phoneMatch = b.clientPhone?.toLowerCase().includes(q);
        if (!nameMatch && !phoneMatch) return false;
      }
      return true;
    });
  }, [bookings, filterFrom, filterTo, searchQuery]);

  const prevMonth = () => {
    if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); }
    else setCalMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); }
    else setCalMonth(m => m + 1);
  };

  const noApprovedChalets = !chaletsLoading && ownerChalets.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-foreground">سجل وتقويم الحجوزات</h2>
        <Button onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } setAddOpen(true); }} size="sm" disabled={isReadOnly}>
          <Plus className="w-4 h-4 me-2" />
          إضافة حجز يدوي
        </Button>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Card 1: Active bookings this month */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground leading-none mb-1">الحجوزات النشطة — الشهر الحالي</p>
            <p className="text-2xl font-extrabold text-foreground leading-none">
              {bookingStats != null ? toAr(bookingStats.activeCurrentMonth) : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              إجمالي {bookingStats != null ? toAr(bookingStats.totalActive) : "—"} حجز نشط
            </p>
          </div>
        </div>

        {/* Card 2: Estimated revenue this month */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
            <Banknote className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground leading-none mb-1">الإيرادات المتوقعة — الشهر الحالي</p>
            <p className="text-xl font-extrabold text-green-600 dark:text-green-400 leading-none">
              {bookingStats != null
                ? `${bookingStats.revenueCurrentMonth.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س`
                : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">بناءً على إجمالي قيم الحجوزات</p>
          </div>
        </div>

        {/* Card 3: Cancelled / Rescheduled ratio */}
        <div className="bg-card border border-border rounded-2xl px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <XCircle className="w-5 h-5 text-orange-500 dark:text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-muted-foreground leading-none mb-1">الملغاة / المعاد جدولتها</p>
            <p className="text-2xl font-extrabold text-foreground leading-none">
              {bookingStats != null
                ? `${toAr(bookingStats.totalCancelled)} / ${toAr(bookingStats.totalRescheduled)}`
                : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">ملغاة / إعادة جدولة</p>
          </div>
        </div>
      </div>

      <AddBookingDialog
        open={addOpen}
        onClose={() => { setAddOpen(false); setPrefilledDate(null); }}
        submissions={submissions}
        onAdded={() => {
          qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
          qc.invalidateQueries({ queryKey: ["owner", "customers"] });
        }}
        existingBookings={bookings}
        prefilledDate={prefilledDate}
        prefilledChaletId={activeChaletId ? String(activeChaletId) : undefined}
        availabilityBlocks={availability}
      />

      {/* Day Booking Summary Dialog */}
      {summaryDate && (() => {
        const sumBkgs = calBookings.filter((b) => {
          if (!b.bookingDate) return false;
          const end = new Date(b.bookingDate);
          end.setDate(end.getDate() + Math.max(1, b.durationDays ?? 1) - 1);
          return summaryDate >= b.bookingDate && summaryDate <= end.toISOString().slice(0, 10);
        });
        const [sy, sm, sd] = summaryDate.split("-").map(Number);
        const sumGreg = new Date(sy, sm - 1, sd).toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long", year: "numeric", calendar: "gregory" });
        const sumHijri = new Date(sy, sm - 1, sd).toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { day: "numeric", month: "long", year: "numeric" });
        const periodName = (p?: string | null) =>
          p === "morning" ? "🌅 الفترة الصباحية" :
          p === "evening" ? "🌙 الفترة المسائية" :
          "☀️ يوم كامل";
        return (
          <Dialog open onOpenChange={() => setSummaryDate(null)}>
            <DialogContent className="max-w-sm" dir="rtl">
              <DialogHeader>
                <DialogTitle className="text-base font-bold leading-snug">
                  حجوزات {sumHijri.replace(/\s*هـ\s*$/, "")} هـ
                  <span className="block text-xs font-normal text-muted-foreground mt-0.5">{sumGreg}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-1">
                {sumBkgs.map((b, bi) => {
                  const total = b.totalPrice ? Math.round(Number(b.totalPrice)) : null;
                  const dep   = b.depositPaid ? Math.round(Number(b.depositPaid)) : null;
                  const bal   = total && dep ? total - dep : null;
                  const popDur = Math.max(1, b.durationDays ?? 1);
                  const popEndD = new Date(new Date(b.bookingDate + "T00:00:00").getTime() + (popDur - 1) * 86400000);
                  const popEndStr = `${popEndD.getFullYear()}-${String(popEndD.getMonth() + 1).padStart(2, "0")}-${String(popEndD.getDate()).padStart(2, "0")}`;
                  const popStartH = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
                  const popStartG = formatDualDate(b.bookingDate).gregorian;
                  const popEndH   = formatDualDate(popEndStr).hijri.replace(/\s*هـ\s*$/, "");
                  const popEndG   = formatDualDate(popEndStr).gregorian;
                  return (
                    <div key={b.id} className={`rounded-xl border p-3 space-y-1.5 ${bi > 0 ? "mt-2" : ""} ${
                      b.period === "morning" ? "border-amber-200 bg-amber-50 dark:bg-amber-900/20" :
                      b.period === "evening" ? "border-blue-200 bg-blue-50 dark:bg-blue-900/20" :
                      "border-red-200 bg-red-50 dark:bg-red-900/20"
                    }`}>
                      <p className="text-sm font-bold">{periodName(b.period)}</p>
                      {/* Duration info row — always shown */}
                      <div className="text-xs text-primary/80 bg-primary/5 rounded-lg px-2.5 py-1.5 leading-relaxed space-y-0.5">
                        {popDur === 1 ? (
                          <p>يوم واحد · {popStartH} هـ <span className="text-muted-foreground/70">({popStartG})</span></p>
                        ) : (
                          <>
                            <p className="font-semibold">لمدة {toAr(popDur)} أيام</p>
                            <p>من: {popStartH} هـ <span className="text-muted-foreground/70">({popStartG})</span></p>
                            <p>إلى: {popEndH} هـ <span className="text-muted-foreground/70">({popEndG})</span></p>
                          </>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>الضيف</span>
                        <span className="font-semibold text-foreground text-left">{b.clientName}</span>
                        {b.clientPhone && <>
                          <span>الجوال</span>
                          <span className="font-semibold text-foreground text-left" dir="ltr">{toAr(b.clientPhone)}</span>
                        </>}
                        {total !== null && <>
                          <span>الإجمالي</span>
                          <span className="font-semibold text-foreground text-left">{total.toLocaleString("ar-SA")} ر.س</span>
                        </>}
                        {dep !== null && dep > 0 && <>
                          <span>العربون</span>
                          <span className="font-semibold text-foreground text-left">{dep.toLocaleString("ar-SA")} ر.س</span>
                        </>}
                        {bal !== null && bal > 0 && <>
                          <span>المتبقي</span>
                          <span className={`font-semibold text-left ${b.balanceCollected ? "text-green-600" : "text-orange-500"}`}>
                            {bal.toLocaleString("ar-SA")} ر.س {b.balanceCollected ? "✓" : ""}
                          </span>
                        </>}
                        {b.source === "external" && <>
                          <span>المصدر</span>
                          <span className="font-semibold text-foreground text-left">خارجي</span>
                        </>}
                        {b.notes && <>
                          <span className="col-span-2 text-foreground/70 italic text-[0.7rem]">{b.notes}</span>
                        </>}
                      </div>
                      {/* Insurance / Deposit block */}
                      {b.insuranceFee && Number(b.insuranceFee) > 0 && (() => {
                        const insAmt = Number(b.insuranceFee);
                        const deducted = Number(b.insuranceDeducted ?? 0);
                        const refundable = Math.max(0, insAmt - deducted);
                        const proofImgsC: string[] = (() => { try { return JSON.parse(b.insuranceProofImages ?? "[]"); } catch { return []; } })();
                        return (
                          <div className={`rounded-lg border px-3 py-2 text-xs mt-1 space-y-1 ${
                            b.insuranceRefunded
                              ? "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700"
                              : "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-700"
                          }`}>
                            {/* Header row */}
                            <div className="flex items-center justify-between">
                              <span className={`font-bold ${b.insuranceRefunded ? "text-slate-500" : "text-orange-700 dark:text-orange-400"}`}>
                                🔒 مبلغ التأمين
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className={`font-bold text-sm ${b.insuranceRefunded ? "text-slate-400" : "text-orange-700 dark:text-orange-400"}`}>
                                  {insAmt.toLocaleString("ar-SA")} ر.س
                                </span>
                                {!b.insuranceRefunded && (
                                  <span className="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">معلّق</span>
                                )}
                                {b.insuranceRefunded && deducted === 0 && (
                                  <span className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">↩ مُعاد</span>
                                )}
                                {b.insuranceRefunded && deducted > 0 && (
                                  <span className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 px-1.5 py-0.5 rounded-full text-[10px] font-semibold">✂️ مخصوم</span>
                                )}
                              </div>
                            </div>
                            {/* Settlement formula — only if settled */}
                            {b.insuranceRefunded && deducted > 0 && (
                              <div className="pt-1 border-t border-slate-200 dark:border-slate-700 space-y-0.5">
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-red-600">✂️ خصم تلفيات</span>
                                  <span className="font-bold text-red-700">{deducted.toLocaleString("ar-SA")} ر.س</span>
                                </div>
                                {b.insuranceDeductReason && (
                                  <div className="text-[10px] text-muted-foreground">السبب: {b.insuranceDeductReason}</div>
                                )}
                                <div className="flex justify-between text-[11px]">
                                  <span className="text-green-600">↩ مُرجَع للعميل</span>
                                  <span className="font-bold text-green-700">{refundable.toLocaleString("ar-SA")} ر.س</span>
                                </div>
                                {proofImgsC.length > 0 && (
                                  <div className="flex gap-1 pt-0.5 flex-wrap">
                                    {proofImgsC.slice(0, 4).map((u, i) => {
                                      const fullU2 = u.startsWith("http") ? u : `${window.location.origin}${BASE}${u}`;
                                      return (
                                        <img key={i} src={fullU2} alt="توثيق" className="w-10 h-10 rounded object-cover border border-border" />
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                      {/* Cancel / Reschedule / Review quick actions */}
                      <div className="flex gap-2 mt-2 pt-2 border-t border-border/50 flex-wrap">
                        <button
                          onClick={() => { setSummaryDate(null); setRescheduleBooking(b); }}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg py-1.5 hover:bg-primary/10 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          إعادة جدولة
                        </button>
                        <button
                          onClick={() => { setSummaryDate(null); setDeleteDialogBooking(b); }}
                          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-destructive border border-destructive/30 rounded-lg py-1.5 hover:bg-destructive/10 transition-colors"
                        >
                          <XCircle className="w-3 h-3" />
                          إلغاء
                        </button>
                        {b.ratedAt ? (
                          <span className="flex-1 flex items-center justify-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded-lg py-1.5 bg-green-50 dark:bg-green-900/10">
                            <CheckCircle className="w-3 h-3" />
                            تم التقييم ✅
                          </span>
                        ) : (
                          <button
                            disabled={reviewSentIds.has(b.id) || reviewPendingId === b.id}
                            onClick={() => sendReviewRequest(b)}
                            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 border border-teal-300 dark:border-teal-800 rounded-lg py-1.5 hover:bg-teal-50 dark:hover:bg-teal-900/20 transition-colors disabled:opacity-50"
                          >
                            {reviewPendingId === b.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : reviewSentIds.has(b.id) ? (
                              <CheckCircle className="w-3 h-3" />
                            ) : (
                              <Star className="w-3 h-3" />
                            )}
                            {reviewSentIds.has(b.id) ? "تم ✓" : "تقييم"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <DialogFooter className="flex flex-row gap-2 justify-start mt-1">
                <Button variant="outline" size="sm" onClick={() => setSummaryDate(null)}>إغلاق</Button>
                <Button variant="ghost" size="sm" onClick={() => { setSummaryDate(null); setBlockDateStr(summaryDate); }}>
                  ضبط الإتاحة
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Calendar Section */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
          <h3 className="font-bold text-foreground flex-1">التقويم والإتاحة</h3>
          {ownerChalets.length > 1 && (
            <Select
              value={String(activeChaletId ?? "")}
              onValueChange={(v) => setSelectedChaletId(Number(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="اختر الشاليه" />
              </SelectTrigger>
              <SelectContent>
                {ownerChalets.map((c: any) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nameAr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {noApprovedChalets ? (
          <div className="text-center py-8">
            <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">لا يوجد شاليه معتمد بعد. بعد موافقة الإدارة سيظهر التقويم هنا.</p>
          </div>
        ) : (
          <>
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <ChevronRight className="w-4 h-4" />
              </button>
              <span className="text-sm font-semibold">{monthLabel}</span>
              <button onClick={nextMonth} className="w-8 h-8 rounded-full hover:bg-secondary flex items-center justify-center">
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {availLoading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : (
              <MiniCalendar
                year={calYear}
                month={calMonth}
                availability={calAvailability}
                bookings={calBookings}
                onDateClick={(ds) => {
                  if (!activeChaletId) return;
                  const dayBkgs = calBookings.filter((b) => {
                    if (!b.bookingDate) return false;
                    const [by, bm, bd] = b.bookingDate.split("-").map(Number);
                    const endDate = new Date(by, bm - 1, bd + Math.max(1, b.durationDays ?? 1) - 1);
                    const endStr = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(endDate.getDate()).padStart(2, "0")}`;
                    return ds >= b.bookingDate && ds <= endStr;
                  });
                  // Hard-block: maintenance/صيانة dates cannot be booked
                  const avEntry = availability.find((a) => a.dateStr === ds);
                  if (avEntry?.notes && dayBkgs.length === 0) {
                    toast({
                      title: "هذا اليوم غير متاح للحجز",
                      description: `صيانة/إغلاق مؤقت — ${avEntry.notes}`,
                      variant: "destructive",
                    });
                    return;
                  }
                  if (dayBkgs.length > 0) {
                    setSummaryDate(ds);
                  } else {
                    if (isReadOnly) { onBlockedEdit(); return; }
                    setPrefilledDate(ds);
                    setAddOpen(true);
                  }
                }}
              />
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center justify-center w-14 h-5 rounded bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-200 text-[10px] font-semibold">يوم كامل</span>
                محجوز بالكامل
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center justify-center w-14 h-5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-[10px] font-semibold">صباحي/مسائي</span>
                محجوز جزئياً
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="w-4 h-5 rounded bg-muted inline-block" />
                متاح
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">انقر على أي تاريخ لضبط الفترات أو عرض تفاصيل الحجز.</p>

            {/* Check-in / Check-out times — per period */}
            {activeChaletId && (
              <div className="mt-5 pt-5 border-t border-border/50">
                <h4 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  أوقات الدخول والخروج
                </h4>
                <p className="text-xs text-muted-foreground mb-3">حدد أوقات الدخول والخروج لكل فترة — تظهر للضيوف عند الاستعراض</p>

                {/* Morning */}
                <div className="rounded-xl border border-border p-3 space-y-2 mb-2">
                  <p className="text-xs font-medium">🌅 الفترة الصباحية</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الدخول</label>
                      <input
                        type="text"
                        value={morningCheckIn}
                        onChange={(e) => setMorningCheckIn(e.target.value)}
                        placeholder="مثال: ٢:٠٠ م"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الخروج</label>
                      <input
                        type="text"
                        value={morningCheckOut}
                        onChange={(e) => setMorningCheckOut(e.target.value)}
                        placeholder="مثال: ١٠:٠٠ ص"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        dir="rtl"
                      />
                    </div>
                  </div>
                </div>

                {/* Evening */}
                <div className="rounded-xl border border-border p-3 space-y-2 mb-2">
                  <p className="text-xs font-medium">🌙 الفترة المسائية</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الدخول</label>
                      <input
                        type="text"
                        value={eveningCheckIn}
                        onChange={(e) => setEveningCheckIn(e.target.value)}
                        placeholder="مثال: ٤:٠٠ م"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الخروج</label>
                      <input
                        type="text"
                        value={eveningCheckOut}
                        onChange={(e) => setEveningCheckOut(e.target.value)}
                        placeholder="مثال: ١٢:٠٠ ص"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        dir="rtl"
                      />
                    </div>
                  </div>
                </div>

                {/* Full day */}
                <div className="rounded-xl border border-border p-3 space-y-2 mb-3">
                  <p className="text-xs font-medium">☀️ يوم كامل</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الدخول</label>
                      <input
                        type="text"
                        value={fullDayCheckIn}
                        onChange={(e) => setFullDayCheckIn(e.target.value)}
                        placeholder="مثال: ٢:٠٠ م"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        dir="rtl"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">وقت الخروج</label>
                      <input
                        type="text"
                        value={fullDayCheckOut}
                        onChange={(e) => setFullDayCheckOut(e.target.value)}
                        placeholder="مثال: ١٢:٠٠ ص"
                        className="w-full bg-background border border-border rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
                        dir="rtl"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button
                    size="sm"
                    onClick={saveTimes}
                    disabled={savingTimes}
                    className="rounded-xl text-xs h-8"
                  >
                    {savingTimes ? <Loader2 className="w-3.5 h-3.5 animate-spin me-1.5" /> : null}
                    حفظ الأوقات
                  </Button>
                  {timesSaved && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      تم الحفظ بنجاح
                    </span>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bookings List */}
      <div>
        {/* Search bar */}
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            value={toAr(searchQuery)}
            onChange={(e) => {
              const raw = e.target.value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
              setSearchQuery(raw);
            }}
            placeholder="بحث عن عميل بالاسم أو رقم الجوال..."
            className="pr-9 rounded-xl text-sm"
            dir="rtl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <h3 className="font-bold text-foreground flex-1">قائمة الحجوزات
            {searchQuery && filteredBookings.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground mr-2">({toAr(filteredBookings.length)} نتيجة)</span>
            )}
          </h3>
          {/* Date range filter */}
          <div className="flex items-end gap-2 flex-wrap">
            <div className="min-w-[130px]">
              <label className="text-[10px] text-muted-foreground font-medium mb-1 block">من تاريخ</label>
              <div className="rounded-xl border border-border bg-background px-3 py-2 min-h-[2.25rem] flex items-center text-sm">
                <DualCalendarPicker value={filterFrom} onChange={setFilterFrom} placeholder="أي تاريخ" />
              </div>
            </div>
            <div className="min-w-[130px]">
              <label className="text-[10px] text-muted-foreground font-medium mb-1 block">إلى تاريخ</label>
              <div className="rounded-xl border border-border bg-background px-3 py-2 min-h-[2.25rem] flex items-center text-sm">
                <DualCalendarPicker value={filterTo} onChange={setFilterTo} placeholder="أي تاريخ" />
              </div>
            </div>
            {(filterFrom || filterTo) && (
              <button
                onClick={() => { setFilterFrom(""); setFilterTo(""); }}
                className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl px-3 py-2 min-h-[2.25rem] transition-colors"
              >
                مسح
              </button>
            )}
          </div>
        </div>
        {bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-base font-semibold mb-2">{(filterFrom || filterTo) ? "لا توجد حجوزات في هذا النطاق" : "لا توجد حجوزات بعد"}</h3>
            <p className="text-sm text-muted-foreground mb-4">{(filterFrom || filterTo) ? "جرّب تغيير نطاق التاريخ" : "سجّل حجوزاتك من واتساب وانستقرام لمتابعة تقويمك"}</p>
            {!filterFrom && !filterTo && (
              <Button size="sm" disabled={isReadOnly} onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } setAddOpen(true); }}>
                <Plus className="w-4 h-4 me-2" />
                إضافة أول حجز
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredBookings.map((b) => {
              const tp = b.totalPrice ? Number(b.totalPrice) : null;
              const dp = b.depositPaid ? Number(b.depositPaid) : null;
              const ins = b.insuranceFee ? Number(b.insuranceFee) : null;
              const remaining = tp !== null && dp !== null ? Math.max(0, tp - dp) : null;
              const fmtAR = (n: number) => n.toLocaleString("ar-SA", { maximumFractionDigits: 2 });

              const sendReceiptWhatsApp = () => {
                // Normalize Saudi phone: strip non-digits, add 966 if starts with 0
                let rawPhone = b.clientPhone?.replace(/\D/g, "") ?? "";
                if (rawPhone.startsWith("00")) rawPhone = rawPhone.slice(2);
                if (rawPhone.startsWith("0")) rawPhone = "966" + rawPhone.slice(1);
                const phone = rawPhone;

                const periodLabel = b.period ? ({ morning: "🌅 صباحي", evening: "🌙 مسائي", full_day: "☀️ يوم كامل" }[b.period] ?? b.period) : "";

                // Build compact message (keep well under WhatsApp's ~4000 char limit)
                const { hijri: hijriDate, gregorian: gregDate } = formatDualDate(b.bookingDate);
                const dualDate = hijriDate && gregDate ? `${hijriDate} | ${gregDate}` : b.bookingDate;
                const lines: string[] = [
                  `🏡 إيصال حجز – حكاية أناقة`,
                  ``,
                  `👤 العميل: ${b.clientName}`,
                  `📅 التاريخ: ${dualDate}`,
                  `⏱ المدة: ${b.durationDays} ${b.durationDays === 1 ? "يوم" : "أيام"}${periodLabel ? ` · ${periodLabel}` : ""}`,
                ];

                if (tp !== null) {
                  lines.push(``, `💰 تفاصيل المبالغ:`);
                  lines.push(`• الإجمالي: ${fmtAR(tp)} ر.س`);
                  lines.push(`• العربون: ${fmtAR(dp ?? 0)} ر.س`);
                  lines.push(`• المتبقي: ${fmtAR(remaining ?? 0)} ر.س${b.balanceCollected ? " ✓" : ""}`);
                }

                if (ins) {
                  if (!b.insuranceRefunded) {
                    lines.push(`• التأمين: ${fmtAR(ins)} ر.س 🔒 (محتجز)`);
                  } else if (b.insuranceDeducted && Number(b.insuranceDeducted) > 0) {
                    const deducted = Number(b.insuranceDeducted);
                    const refunded = Math.max(0, ins - deducted);
                    const proofImgs2: string[] = (() => { try { return JSON.parse(b.insuranceProofImages ?? "[]"); } catch { return []; } })();
                    lines.push(``, `✂️ تم خصم مبلغ ${fmtAR(deducted)} ر.س من التأمين`);
                    if (b.insuranceDeductReason) lines.push(`📋 بسبب: ${b.insuranceDeductReason}`);
                    if (refunded > 0) lines.push(`💚 المبلغ المتبقي المُرجَع إليك: ${fmtAR(refunded)} ر.س`);
                    else lines.push(`💚 المبلغ المُرجَع: ٠ ر.س`);
                    // Proof link goes at the very end — assembled after pushing footer
                    if (proofImgs2.length > 0) {
                      const base2 = import.meta.env.BASE_URL.replace(/\/$/, "");
                      const firstUrl = proofImgs2[0].startsWith("http")
                        ? proofImgs2[0]
                        : `${window.location.origin}${base2}${proofImgs2[0]}`;
                      lines.push(``, `✨ منصة حكاية أناقة – شاليهات القصيم`);
                      lines.push(``, `📸 صور التوثيق الإضافية:`, firstUrl);
                      // Skip the shared footer below since we already pushed it
                      const msg = lines.join("\n");
                      const encoded = encodeURIComponent(msg);
                      const waUrl = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
                      const a = document.createElement("a");
                      a.href = waUrl; a.target = "_blank"; a.rel = "noopener noreferrer";
                      document.body.appendChild(a); a.click(); document.body.removeChild(a);
                      return;
                    }
                  } else {
                    lines.push(`• التأمين: ${fmtAR(ins)} ر.س ↩ تم الإرجاع بالكامل`);
                  }
                }

                // Include chalet terms if available
                const activeChalet = ownerChalets.find((c: any) => c.id === activeChaletId);
                const terms: string = activeChalet?.termsAndConditions ?? "";
                if (terms.trim()) {
                  const termLines = terms.split("\n").map((l: string) => l.trim()).filter(Boolean);
                  if (termLines.length > 0) {
                    lines.push(``, `📋 الشروط والأحكام:`);
                    termLines.forEach((t: string) => lines.push(`• ${t}`));
                  }
                }

                lines.push(``, `✨ منصة حكاية أناقة – شاليهات القصيم`);
                const msg = lines.join("\n");

                // Use <a> click — works reliably inside iframes unlike window.open
                const encoded = encodeURIComponent(msg);
                const waUrl = phone
                  ? `https://wa.me/${phone}?text=${encoded}`
                  : `https://wa.me/?text=${encoded}`;
                const a = document.createElement("a");
                a.href = waUrl;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              };

              return (
                <motion.div
                  key={b.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-card border border-border rounded-xl p-4 space-y-3"
                >
                  {/* Header row */}
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {b.source === "platform" ? <Globe className="w-4 h-4 text-primary" /> : <Phone className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <p className="font-semibold text-foreground leading-tight">{b.clientName}</p>
                          {b.clientPhone && <p className="text-xs text-muted-foreground" dir="ltr">{toAr(b.clientPhone)}</p>}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.source === "platform" ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"}`}>
                            {b.source === "platform" ? "المنصة" : "خارجي"}
                          </span>
                          {b.balanceCollected && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">✓ تم التحصيل</span>
                          )}
                          {ins && !b.insuranceRefunded && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">🔒 تأمين محتجز</span>
                          )}
                          {b.insuranceRefunded && !b.insuranceDeducted && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">↩ تم إعادة التأمين</span>
                          )}
                          {b.insuranceRefunded && b.insuranceDeducted && Number(b.insuranceDeducted) > 0 && (
                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">✂️ تلفيات: {fmtAR(Number(b.insuranceDeducted))} ر.س</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDualDate(b.bookingDate).hijri} [{formatDualDate(b.bookingDate).gregorian}]</span>
                        <span>{toAr(b.durationDays)} {b.durationDays === 1 ? "يوم" : "أيام"}</span>
                        {b.period && (
                          <span className="font-medium text-primary">
                            {{ morning: "🌅 صباحي", evening: "🌙 مسائي", full_day: "☀️ يوم كامل" }[b.period as string] ?? b.period}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <button
                        onClick={() => setRescheduleBooking(b)}
                        className="text-muted-foreground hover:text-primary transition-colors p-1 rounded"
                        aria-label="إعادة جدولة"
                        title="إعادة جدولة"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteDialogBooking(b)}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                        aria-label="إلغاء الحجز"
                        title="إلغاء الحجز"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Multi-day duration summary */}
                  {(b.durationDays ?? 1) > 1 && (() => {
                    const endD = new Date(new Date(b.bookingDate + "T00:00:00").getTime() + ((b.durationDays ?? 1) - 1) * 86400000);
                    const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
                    const startHijri = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
                    const startGreg  = formatDualDate(b.bookingDate).gregorian;
                    const endHijri   = formatDualDate(endStr).hijri.replace(/\s*هـ\s*$/, "");
                    const endGreg    = formatDualDate(endStr).gregorian;
                    return (
                      <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-xs text-primary font-medium leading-relaxed space-y-0.5">
                        <p>لمدة {toAr(b.durationDays)} أيام</p>
                        <p className="text-primary/80">من: {startHijri} هـ <span className="text-primary/50 font-normal">({startGreg})</span></p>
                        <p className="text-primary/80">إلى: {endHijri} هـ <span className="text-primary/50 font-normal">({endGreg})</span></p>
                      </div>
                    );
                  })()}

                  {/* Financial summary */}
                  {tp !== null && (
                    <div className="grid grid-cols-3 gap-2 bg-muted/40 rounded-lg p-2.5 text-center">
                      <div>
                        <p className="text-[10px] text-muted-foreground">الإجمالي</p>
                        <p className="text-xs font-bold text-foreground">{fmtAR(tp)} ر.س</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">العربون</p>
                        <p className="text-xs font-bold text-green-600 dark:text-green-400">{fmtAR(dp ?? 0)} ر.س</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">المتبقي</p>
                        <p className={`text-xs font-bold ${b.balanceCollected ? "text-green-600 dark:text-green-400 line-through" : "text-amber-600 dark:text-amber-400"}`}>
                          {fmtAR(remaining ?? 0)} ر.س
                        </p>
                      </div>
                    </div>
                  )}
                  {ins !== null && (
                    <div className={`rounded-lg border px-3 py-2 ${b.insuranceRefunded ? "bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700" : "bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800"}`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-semibold ${b.insuranceRefunded ? "text-slate-500" : "text-orange-700 dark:text-orange-400"}`}>🔒 مبلغ التأمين</span>
                        <span className={`text-xs font-bold ${b.insuranceRefunded ? "text-slate-400 line-through" : "text-orange-700 dark:text-orange-400"}`}>
                          {fmtAR(ins)} ر.س
                        </span>
                      </div>
                      {b.insuranceDeducted && Number(b.insuranceDeducted) > 0 && (() => {
                        const proofImgs: string[] = (() => { try { return JSON.parse(b.insuranceProofImages ?? "[]"); } catch { return []; } })();
                        const base = import.meta.env.BASE_URL.replace(/\/$/, "");
                        const fullU = (u: string) => u.startsWith("http") ? u : `${window.location.origin}${base}${u}`;
                        return (
                          <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700 flex flex-col gap-0.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="text-red-600">✂️ خصم تلفيات</span>
                              <span className="font-bold text-red-700">{fmtAR(Number(b.insuranceDeducted))} ر.س</span>
                            </div>
                            {b.insuranceDeductReason && (
                              <div className="text-[10px] text-muted-foreground">السبب: {b.insuranceDeductReason}</div>
                            )}
                            <div className="flex justify-between text-[11px]">
                              <span className="text-green-600">↩ مُرجَع للعميل</span>
                              <span className="font-bold text-green-700">{fmtAR(Math.max(0, ins - Number(b.insuranceDeducted)))} ر.س</span>
                            </div>
                            {/* Proof image thumbnails */}
                            {proofImgs.length > 0 && (
                              <div className="mt-1.5 flex flex-col gap-1">
                                <div className="grid grid-cols-3 gap-1">
                                  {proofImgs.slice(0, 3).map((u, i) => (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => setProofTarget(b)}
                                      className="relative rounded overflow-hidden aspect-square bg-muted hover:opacity-80 transition"
                                    >
                                      <img src={fullU(u)} alt={`إثبات ${i+1}`} className="w-full h-full object-cover" />
                                      {i === 2 && proofImgs.length > 3 && (
                                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-bold">
                                          +{toAr(proofImgs.length - 3)}
                                        </div>
                                      )}
                                    </button>
                                  ))}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setProofTarget(b)}
                                  className="text-[10px] text-blue-600 underline text-right mt-0.5"
                                >
                                  📸 عرض الإثبات ({toAr(proofImgs.length)} صورة)
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {b.notes && <p className="text-xs text-muted-foreground border-t border-border pt-2">{b.notes}</p>}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* WhatsApp receipt */}
                    <button
                      onClick={sendReceiptWhatsApp}
                      className="flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-2.5 py-1 hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      إيصال واتساب
                    </button>
                    {/* Request Review */}
                    {activeChaletId && (
                      b.ratedAt ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg px-2.5 py-1">
                          <CheckCircle className="w-3.5 h-3.5" />
                          تم التقييم ✅
                        </span>
                      ) : (
                        <button
                          disabled={reviewSentIds.has(b.id) || reviewPendingId === b.id}
                          onClick={() => sendReviewRequest(b)}
                          className="flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg px-2.5 py-1 hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-50"
                        >
                          {reviewPendingId === b.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : reviewSentIds.has(b.id) ? (
                            <CheckCircle className="w-3.5 h-3.5" />
                          ) : (
                            <Star className="w-3.5 h-3.5" />
                          )}
                          {reviewSentIds.has(b.id) ? "تم الإرسال ✓" : "طلب تقييم"}
                        </button>
                      )
                    )}
                    {/* Collect balance */}
                    {remaining !== null && remaining > 0 && !b.balanceCollected && (
                      <button
                        onClick={() => patchBookingStatus.mutate({ id: b.id, patch: { balanceCollected: true } })}
                        disabled={patchBookingStatus.isPending}
                        className="flex items-center gap-1.5 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors disabled:opacity-50"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        تم تحصيل المتبقي
                      </button>
                    )}
                    {/* Manage insurance */}
                    {ins && !b.insuranceRefunded && (
                      <button
                        onClick={() => setInsuranceTarget(b)}
                        className="flex items-center gap-1.5 text-xs font-medium text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-2.5 py-1 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                      >
                        🔒 إدارة التأمين
                      </button>
                    )}
                    {/* View damage proof */}
                    {b.insuranceDeducted && Number(b.insuranceDeducted) > 0 && (() => {
                      const imgs: string[] = (() => { try { return JSON.parse(b.insuranceProofImages ?? "[]"); } catch { return []; } })();
                      return imgs.length > 0 ? (
                        <button
                          onClick={() => setProofTarget(b)}
                          className="flex items-center gap-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg px-2.5 py-1 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                        >
                          📸 عرض الإثبات
                        </button>
                      ) : null;
                    })()}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Archive Section */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        <button
          onClick={() => setShowArchive((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Archive className="w-4 h-4" />
            الأرشيف
          </span>
          {showArchive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showArchive && (
          <div className="border-t border-border">
            {/* Archive Tab Switcher */}
            <div className="flex gap-1 px-5 pt-4 pb-0">
              <button
                onClick={() => setArchiveTab("cancelled")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${archiveTab === "cancelled" ? "bg-destructive/10 text-destructive" : "text-muted-foreground hover:bg-muted/40"}`}
              >
                الملغاة
              </button>
              <button
                onClick={() => setArchiveTab("rescheduled")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors ${archiveTab === "rescheduled" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/40"}`}
              >
                إعادة الجدولة
              </button>
            </div>

            {/* Cancelled Tab */}
            {archiveTab === "cancelled" && (
              <div className="px-5 pb-5 pt-3 space-y-3">
                {(() => {
                  const q = searchQuery.trim().toLowerCase();
                  const filtered = q
                    ? cancelledBookings.filter((b) =>
                        b.clientName?.toLowerCase().includes(q) || b.clientPhone?.toLowerCase().includes(q)
                      )
                    : cancelledBookings;
                  if (filtered.length === 0) return (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {q ? "لا توجد نتائج مطابقة" : "لا توجد حجوزات ملغاة"}
                    </p>
                  );
                  return filtered.map((b) => {
                  const dur = b.durationDays ?? 1;
                  const endD = new Date(new Date(b.bookingDate + "T00:00:00").getTime() + (dur - 1) * 86400000);
                  const endStr = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(endD.getDate()).padStart(2, "0")}`;
                  const startHijri = formatDualDate(b.bookingDate).hijri.replace(/\s*هـ\s*$/, "");
                  const startGreg  = formatDualDate(b.bookingDate).gregorian;
                  const endHijri   = dur > 1 ? formatDualDate(endStr).hijri.replace(/\s*هـ\s*$/, "") : null;
                  const endGreg    = dur > 1 ? formatDualDate(endStr).gregorian : null;
                  const cancelledDateRaw = b.cancelledAt ? new Date(b.cancelledAt) : null;
                  const cancelledDateStr = cancelledDateRaw ? (() => {
                    const y = cancelledDateRaw.getFullYear();
                    const m = cancelledDateRaw.getMonth() + 1;
                    const d = cancelledDateRaw.getDate();
                    const iso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const h = formatDualDate(iso).hijri.replace(/\s*هـ\s*$/, "");
                    const g = formatDualDate(iso).gregorian;
                    return `${h} هـ (${g})`;
                  })() : "";
                  const periodLabel = b.period ? ({ morning: "صباحي", evening: "مسائي", full_day: "يوم كامل" }[b.period] ?? b.period) : "";
                  return (
                    <div key={b.id} className="bg-muted/30 border border-dashed border-destructive/30 rounded-xl p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <p className="text-sm font-semibold text-foreground line-through decoration-destructive/50">{b.clientName}</p>
                          {b.clientPhone && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
                              <span className="not-italic">📞</span> {toAr(b.clientPhone)}
                            </p>
                          )}
                          {dur === 1 ? (
                            <p className="text-xs text-muted-foreground">
                              {startHijri} هـ <span className="opacity-60">({startGreg})</span>{periodLabel ? ` · ${periodLabel}` : ""}
                            </p>
                          ) : (
                            <div className="text-xs text-muted-foreground space-y-0.5">
                              <p className="font-medium">لمدة {toAr(dur)} أيام{periodLabel ? ` · ${periodLabel}` : ""}</p>
                              <p>من: {startHijri} هـ <span className="opacity-60">({startGreg})</span></p>
                              <p>إلى: {endHijri} هـ <span className="opacity-60">({endGreg})</span></p>
                            </div>
                          )}
                          {b.cancelReason && (
                            <p className="text-xs text-destructive/90 bg-destructive/5 border border-destructive/15 rounded px-2 py-1.5 leading-relaxed break-words">
                              <span className="font-semibold">سبب الإلغاء:</span> {b.cancelReason}
                            </p>
                          )}
                          {cancelledDateStr && (
                            <p className="text-[11px] text-muted-foreground/60">أُلغي في {cancelledDateStr}</p>
                          )}
                        </div>
                        <button
                          onClick={() => restoreBooking.mutate(b.id)}
                          disabled={restoreBooking.isPending}
                          className="flex items-center gap-1 text-xs font-medium text-primary border border-primary/30 rounded-lg px-2.5 py-1.5 hover:bg-primary/10 transition-colors disabled:opacity-50 shrink-0"
                        >
                          <RotateCcw className="w-3 h-3" />
                          استعادة
                        </button>
                      </div>
                    </div>
                  );
                  });
                })()}
              </div>
            )}

            {/* Rescheduled Tab */}
            {archiveTab === "rescheduled" && (
              <div className="px-5 pb-5 pt-3 space-y-3">
                {(() => {
                  const q = searchQuery.trim().toLowerCase();
                  const filteredLog = q
                    ? rescheduleLog.filter((log) =>
                        log.clientName?.toLowerCase().includes(q) || log.clientPhone?.toLowerCase().includes(q)
                      )
                    : rescheduleLog;
                  if (filteredLog.length === 0) return (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {q ? "لا توجد نتائج مطابقة" : "لا توجد سجلات إعادة جدولة"}
                    </p>
                  );
                  return filteredLog.map((log) => {
                  const oldHijri = formatDualDate(log.oldDate).hijri.replace(/\s*هـ\s*$/, "");
                  const newHijri = formatDualDate(log.newDate).hijri.replace(/\s*هـ\s*$/, "");
                  const oldGreg  = formatDualDate(log.oldDate).gregorian;
                  const newGreg  = formatDualDate(log.newDate).gregorian;
                  const pLabel   = (p?: string | null) => p ? ({ morning: "🌅 صباحي", evening: "🌙 مسائي", full_day: "☀️ يوم كامل" }[p] ?? p) : "";
                  const logDateRaw = new Date(log.rescheduledAt);
                  const logIso = `${logDateRaw.getFullYear()}-${String(logDateRaw.getMonth() + 1).padStart(2, "0")}-${String(logDateRaw.getDate()).padStart(2, "0")}`;
                  const logHijri = formatDualDate(logIso).hijri.replace(/\s*هـ\s*$/, "");
                  const logGreg  = formatDualDate(logIso).gregorian;
                  // Compute end dates for multi-day ranges
                  const oldEndD = new Date(new Date(log.oldDate + "T00:00:00").getTime() + (log.oldDuration - 1) * 86400000);
                  const oldEndStr = `${oldEndD.getFullYear()}-${String(oldEndD.getMonth() + 1).padStart(2, "0")}-${String(oldEndD.getDate()).padStart(2, "0")}`;
                  const newEndD = new Date(new Date(log.newDate + "T00:00:00").getTime() + (log.newDuration - 1) * 86400000);
                  const newEndStr = `${newEndD.getFullYear()}-${String(newEndD.getMonth() + 1).padStart(2, "0")}-${String(newEndD.getDate()).padStart(2, "0")}`;
                  return (
                    <div key={log.id} className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2.5">
                      {/* Header */}
                      <div className="space-y-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-foreground">{log.clientName}</p>
                        </div>
                        {log.clientPhone && (
                          <p className="text-xs text-muted-foreground" dir="ltr">📞 {toAr(log.clientPhone)}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground/70">
                          <span className="font-semibold">تاريخ إعادة الجدولة:</span> {logHijri} هـ <span className="opacity-70">({logGreg})</span>
                        </p>
                      </div>
                      {/* Old → New date cards */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-muted/50 rounded-lg p-2.5 space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">التاريخ القديم</p>
                          <p className="font-semibold text-foreground">{oldHijri} هـ</p>
                          <p className="text-muted-foreground/70">{oldGreg}</p>
                          {log.oldDuration > 1 && (
                            <>
                              <p className="text-muted-foreground">إلى: {formatDualDate(oldEndStr).hijri.replace(/\s*هـ\s*$/, "")} هـ</p>
                              <p className="text-muted-foreground/60">{formatDualDate(oldEndStr).gregorian}</p>
                            </>
                          )}
                          <p className="text-muted-foreground">{toAr(log.oldDuration)} {log.oldDuration === 1 ? "يوم" : "أيام"}{pLabel(log.oldPeriod) ? ` · ${pLabel(log.oldPeriod)}` : ""}</p>
                        </div>
                        <div className="bg-primary/10 rounded-lg p-2.5 space-y-1">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-wide">التاريخ الجديد</p>
                          <p className="font-semibold text-foreground">{newHijri} هـ</p>
                          <p className="text-muted-foreground/70">{newGreg}</p>
                          {log.newDuration > 1 && (
                            <>
                              <p className="text-muted-foreground">إلى: {formatDualDate(newEndStr).hijri.replace(/\s*هـ\s*$/, "")} هـ</p>
                              <p className="text-muted-foreground/60">{formatDualDate(newEndStr).gregorian}</p>
                            </>
                          )}
                          <p className="text-muted-foreground">{toAr(log.newDuration)} {log.newDuration === 1 ? "يوم" : "أيام"}{pLabel(log.newPeriod) ? ` · ${pLabel(log.newPeriod)}` : ""}</p>
                        </div>
                      </div>
                      {/* Reason — fully visible, no truncation */}
                      {log.reason && (
                        <div className="bg-background border border-primary/15 rounded-lg px-3 py-2">
                          <p className="text-[10px] font-bold text-primary uppercase tracking-wide mb-1">سبب التعديل</p>
                          <p className="text-xs text-foreground leading-relaxed break-words">{log.reason}</p>
                        </div>
                      )}
                    </div>
                  );
                  });
                })()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manage Insurance Dialog */}
      <ManageInsuranceDialog
        booking={insuranceTarget}
        open={!!insuranceTarget}
        onClose={() => setInsuranceTarget(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["owner", "bookings"] })}
        apiFetch={apiFetch}
        formatAmount={(v) => v === null || v === undefined ? "0" : Number(v).toLocaleString("ar-SA")}
      />

      <ProofViewerDialog
        booking={proofTarget}
        open={!!proofTarget}
        onClose={() => setProofTarget(null)}
      />

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={!!deleteDialogBooking}
        booking={deleteDialogBooking}
        onClose={() => setDeleteDialogBooking(null)}
        onConfirm={(id, reason) => { if (isReadOnly) { onBlockedEdit(); return; } deleteBooking.mutate({ id, reason }); }}
      />

      {/* Reschedule Dialog */}
      <RescheduleDialog
        open={!!rescheduleBooking}
        booking={rescheduleBooking}
        existingBookings={bookings}
        onClose={() => setRescheduleBooking(null)}
        onRescheduled={() => {
          qc.invalidateQueries({ queryKey: ["owner", "bookings"] });
          qc.invalidateQueries({ queryKey: ["owner", "bookings", "reschedule-log"] });
          qc.invalidateQueries({ queryKey: ["owner", "bookings", "stats"] });
          toast({ title: "تمت إعادة الجدولة", description: "تم تحديث موعد الحجز بنجاح." });
        }}
      />

      {/* Block Date Dialog */}
      {blockDateStr && activeChaletId && (
        <BlockDateDialog
          open={!!blockDateStr}
          onClose={() => setBlockDateStr(null)}
          dateStr={blockDateStr}
          chaletId={activeChaletId}
          existing={blockEntry}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["owner", "availability", activeChaletId] });
            setBlockDateStr(null);
          }}
        />
      )}
    </div>
  );
}

/* ── Service Submissions Tab ─────────────────── */
interface ServiceSubmission {
  id: number;
  businessName: string;
  category: string;
  city: string;
  descriptionAr: string | null;
  logoUrl: string | null;
  galleryPhotos: string[];
  status: string;
  adminNote: string | null;
  createdAt: string;
}

const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  bounce_houses: "🎪 نطيطات",
  ice_cream: "🍦 آيس كريم",
  productive_families: "🎀 أسر منتجة",
  catering: "🍽️ تموين وضيافة",
  photography: "📸 تصوير",
  decoration: "🎊 ديكور وتزيين",
  entertainment: "🎶 ترفيه وأناشيد",
  other: "✨ أخرى",
};

function ServiceSubmissionsTab() {
  const { data: submissions = [], isLoading } = useQuery<ServiceSubmission[]>({
    queryKey: ["my-service-submissions"],
    queryFn: async () => {
      const r = await apiFetch("/providers/my/submissions");
      if (!r.ok) return [];
      return r.json();
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-2xl" />)}
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-card border border-dashed border-border rounded-2xl p-12 text-center"
      >
        <Star className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">لا توجد خدمات مسجلة بعد</h3>
        <p className="text-muted-foreground mb-6">سجّل خدمتك لتظهر لعملاء في منطقة القصيم</p>
        <Link href="/add-service-provider">
          <Button>
            <Plus className="w-4 h-4 me-2" />
            تسجيل خدمة جديدة
          </Button>
        </Link>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4">
      {submissions.map((sub, idx) => {
        const status = statusConfig[sub.status as keyof typeof statusConfig] ?? statusConfig.pending;
        const mainPhoto = sub.galleryPhotos?.[0] ?? sub.logoUrl;
        return (
          <motion.div
            key={sub.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className="bg-card border border-border rounded-2xl p-5 md:p-6 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              {mainPhoto ? (
                <img src={mainPhoto} alt={sub.businessName} className="w-full sm:w-28 h-20 object-cover rounded-xl shrink-0" />
              ) : (
                <div className="w-full sm:w-28 h-20 bg-muted rounded-xl shrink-0 flex items-center justify-center text-3xl">
                  {SERVICE_CATEGORY_LABELS[sub.category]?.split(" ")[0] ?? "✨"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <h3 className="text-lg font-bold text-foreground">{sub.businessName}</h3>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full ${status.className}`}>
                    {status.icon}{status.label}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-sm text-muted-foreground">
                  <span>{SERVICE_CATEGORY_LABELS[sub.category] ?? sub.category}</span>
                  {sub.city && (
                    <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" />{sub.city}</span>
                  )}
                  {sub.createdAt && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(sub.createdAt).toLocaleDateString("ar-SA")}
                    </span>
                  )}
                </div>
                {sub.descriptionAr && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{sub.descriptionAr}</p>
                )}
                {sub.adminNote && (sub.status === "rejected" || sub.status === "needs_revision") && (
                  <div className={`mt-3 flex items-start gap-2.5 rounded-xl px-3.5 py-3 border ${
                    sub.status === "needs_revision"
                      ? "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/40"
                      : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40"
                  }`}>
                    <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${sub.status === "needs_revision" ? "text-orange-500" : "text-red-500"}`} />
                    <div>
                      <p className={`text-xs font-bold mb-0.5 ${sub.status === "needs_revision" ? "text-orange-700 dark:text-orange-400" : "text-red-700 dark:text-red-400"}`}>
                        {sub.status === "needs_revision" ? "ملاحظات الإدارة — يرجى التعديل والإعادة" : "سبب الرفض"}
                      </p>
                      <p className={`text-xs leading-relaxed ${sub.status === "needs_revision" ? "text-orange-800 dark:text-orange-300" : "text-red-800 dark:text-red-300"}`}>
                        {sub.adminNote}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ── Revenue Tab ─────────────────────────────── */
function RevenueTab() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [filter, setFilter] = useState<"all" | "deposit" | "balance" | "damage">("all");
  const [proofTarget, setProofTarget] = useState<OwnerBooking | null>(null);
  const [reviewSentRevIds, setReviewSentRevIds] = useState<Set<number>>(new Set());
  const [reviewPendingRevId, setReviewPendingRevId] = useState<number | null>(null);
  const { toast } = useToast();

  const monthOptions = useMemo(() => {
    const opts: { val: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const val = d.toISOString().slice(0, 7);
      const hijriPart = new Date(d.getFullYear(), d.getMonth(), 15).toLocaleDateString("ar-SA-u-ca-islamic-umalqura", { month: "long", year: "numeric" });
      const gregPart = d.toLocaleDateString("ar-SA", { month: "long", year: "numeric", calendar: "gregory" });
      const label = `${hijriPart} · ${gregPart}`;
      opts.push({ val, label });
    }
    return opts.reverse();
  }, []);

  const { data: revOwnerChalets = [] } = useQuery<{ id: number; submissionId: number | null; nameAr: string; waReviewTemplate?: string | null }[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) return [];
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: siteSettingsCache = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch(`${import.meta.env.BASE_URL}api/page-content`);
      if (!r.ok) return {};
      const rows: { key: string; value: string }[] = await r.json();
      return Object.fromEntries(rows.map((x) => [x.key, x.value]));
    },
    staleTime: 5 * 60 * 1000,
  });

  const fmtN = (n: number) => Math.round(n).toLocaleString("ar-SA");

  const { data: financial, isLoading: finLoading } = useQuery<{
    totalRevenue: number; totalDeposits: number; totalPendingBalance: number;
    totalInsuranceHeld: number; totalInsuranceDeducted: number;
  }>({
    queryKey: ["owner", "financial-summary-rev", selectedMonth],
    queryFn: async () => {
      const r = await apiFetch(`/owner/financial-summary?month=${selectedMonth}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const { data: allBookings = [], isLoading: bkLoading } = useQuery<OwnerBooking[]>({
    queryKey: ["owner", "bookings-revenue"],
    queryFn: async () => {
      const r = await apiFetch("/owner/bookings");
      if (!r.ok) return [];
      return r.json();
    },
  });

  // Filter bookings to selected month
  const monthBookings = useMemo(() =>
    allBookings.filter(b => b.bookingDate?.startsWith(selectedMonth))
  , [allBookings, selectedMonth]);

  // Build revenue rows: each booking can generate 1-3 rows
  interface RevenueRow {
    bookingId: number;
    clientName: string;
    bookingDate: string;
    type: "deposit" | "balance" | "damage";
    amount: number;
    reason?: string;
    proofImages?: string | null;
    booking: OwnerBooking;
  }

  const rows = useMemo<RevenueRow[]>(() => {
    const result: RevenueRow[] = [];
    for (const b of monthBookings) {
      const dep = Math.round(Number(b.depositPaid ?? 0));
      const total = b.totalPrice ? Math.round(Number(b.totalPrice)) : null;

      // Deposit row (always, if deposit recorded)
      if (dep > 0) {
        result.push({ bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate, type: "deposit", amount: dep, booking: b });
      } else if (b.revenueAmount && !b.totalPrice) {
        result.push({ bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate, type: "deposit", amount: Math.round(Number(b.revenueAmount)), booking: b });
      }

      // Remaining / balance row (only if collected)
      if (total !== null && dep > 0 && b.balanceCollected) {
        const rem = Math.max(0, total - dep);
        if (rem > 0) result.push({ bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate, type: "balance", amount: rem, booking: b });
      }

      // Damage deduction row
      if (b.insuranceDeducted && Number(b.insuranceDeducted) > 0) {
        result.push({
          bookingId: b.id, clientName: b.clientName, bookingDate: b.bookingDate,
          type: "damage", amount: Math.round(Number(b.insuranceDeducted)),
          reason: b.insuranceDeductReason ?? undefined,
          proofImages: b.insuranceProofImages, booking: b,
        });
      }
    }
    return result;
  }, [monthBookings]);

  const filteredRows = filter === "all" ? rows : rows.filter(r => r.type === filter);

  const TYPE_META = {
    deposit: { label: "عربون",       emoji: "💵", cls: "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
    balance: { label: "متبقي محصّل", emoji: "✅", cls: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
    damage:  { label: "خصم تلفيات", emoji: "✂️", cls: "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  } as const;

  const loading = finLoading || bkLoading;

  return (
    <div className="space-y-5" dir="rtl">
      {/* Month selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <TrendingUp className="w-5 h-5 text-primary shrink-0" />
        <h2 className="text-lg font-bold text-foreground">الإيرادات</h2>
        <div className="ms-auto w-48">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {monthOptions.map(o => <SelectItem key={o.val} value={o.val}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 3 Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Monthly Revenue */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <DollarSign className="w-3.5 h-3.5 text-green-500" />
            إجمالي إيرادات الشهر
          </div>
          {loading ? <Skeleton className="h-7 w-24" /> : (
            <div className="text-2xl font-bold text-green-600">{fmtN(financial?.totalRevenue ?? 0)} <span className="text-sm font-normal text-muted-foreground">ر.س</span></div>
          )}
          <div className="text-[11px] text-muted-foreground">عربون + متبقي محصّل + تلفيات</div>
        </div>

        {/* Insurance Held */}
        <div className="bg-card border border-orange-200 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Lock className="w-3.5 h-3.5 text-orange-500" />
            تأمينات محتجزة حالياً
          </div>
          {loading ? <Skeleton className="h-7 w-24" /> : (
            <div className="text-2xl font-bold text-orange-600">{fmtN(financial?.totalInsuranceHeld ?? 0)} <span className="text-sm font-normal text-muted-foreground">ر.س</span></div>
          )}
          <div className="text-[11px] text-muted-foreground">غير محتسبة في الأرباح</div>
        </div>

        {/* Pending Collections */}
        <div className="bg-card border border-amber-200 rounded-2xl p-4 space-y-1">
          <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            مبالغ متبقية لم تُحصَّل
          </div>
          {loading ? <Skeleton className="h-7 w-24" /> : (
            <div className="text-2xl font-bold text-amber-600">{fmtN(financial?.totalPendingBalance ?? 0)} <span className="text-sm font-normal text-muted-foreground">ر.س</span></div>
          )}
          <div className="text-[11px] text-muted-foreground">مبالغ مستحقة من العملاء</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Receipt className="w-4 h-4 text-primary" />
          <h3 className="font-bold text-sm text-foreground">سجل الإيرادات</h3>
          <div className="ms-auto flex gap-1 flex-wrap">
            {([["all", "الكل"], ["deposit", "عربون"], ["balance", "متبقي"], ["damage", "تلفيات"]] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setFilter(v)}
                className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${filter === v ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : filteredRows.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">لا توجد إيرادات لهذا الشهر</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">العميل</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">التاريخ</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">النوع</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">المبلغ</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, i) => {
                  const { hijri, gregorian } = formatDualDate(row.bookingDate);
                  const meta = TYPE_META[row.type];
                  const hasProof = row.type === "damage" && (() => { try { return JSON.parse(row.proofImages ?? "[]").length > 0; } catch { return false; } })();
                  const chaletId = revOwnerChalets.find((c) => c.submissionId === row.booking.submissionId)?.id ?? null;
                  const revSent = reviewSentRevIds.has(row.bookingId);
                  const revPending = reviewPendingRevId === row.bookingId;
                  return (
                    <tr key={`${row.bookingId}-${row.type}-${i}`} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-3 font-medium">{row.clientName}</td>
                      <td className="py-2.5 px-3 text-xs">
                        <div className="font-medium">{hijri}</div>
                        <div className="text-muted-foreground">{gregorian}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>
                          {meta.emoji} {meta.label}
                        </span>
                        {row.reason && <div className="text-[10px] text-muted-foreground mt-0.5">{row.reason}</div>}
                        {hasProof && (
                          <button
                            type="button"
                            onClick={() => setProofTarget(row.booking)}
                            className="text-[10px] text-purple-600 underline mt-0.5 block"
                          >📸 عرض الإثبات</button>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-left font-bold text-base tabular-nums">
                        <span className={row.type === "damage" ? "text-red-600" : row.type === "balance" ? "text-green-600" : "text-blue-600"}>
                          {fmtN(row.amount)}
                        </span>
                        <span className="text-[10px] font-normal text-muted-foreground ms-1">ر.س</span>
                      </td>
                      <td className="py-2.5 px-3">
                        {chaletId && (
                          <button
                            disabled={revSent || revPending}
                            onClick={async () => {
                              if (!chaletId) return;
                              setReviewPendingRevId(row.bookingId);
                              try {
                                const r = await apiFetch("/owner/review-invite", {
                                  method: "POST",
                                  body: JSON.stringify({ chaletId, guestName: row.clientName }),
                                });
                                if (r.ok) {
                                  const data = await r.json();
                                  const revBase = import.meta.env.BASE_URL.replace(/\/$/, "");
                                  const link = `${window.location.origin}${revBase}/r/${data.token}`;
                                  const revChalet = revOwnerChalets.find((c) => c.id === chaletId);
                                  const chaletName = revChalet?.nameAr ?? "شاليهنا";
                                  const revSiteSettings = siteSettingsCache;
                                  const DEFAULT_WA_REV = "أهلاً {guest_name}، يسعدنا تقييمك لتجربتك في {chalet_name} 🌟\nاضغط هنا لتقييمك: {link}";
                                  const tpl = (revChalet as any)?.waReviewTemplate ?? revSiteSettings?.wa_review_template ?? DEFAULT_WA_REV;
                                  const msg = tpl
                                    .replace(/\{link\}/g, link)
                                    .replace(/\{guest_name\}/g, row.clientName ?? "")
                                    .replace(/\{chalet_name\}/g, chaletName);
                                  let rawPhone = row.booking.clientPhone?.replace(/\D/g, "") ?? "";
                                  if (rawPhone.startsWith("00")) rawPhone = rawPhone.slice(2);
                                  if (rawPhone.startsWith("0")) rawPhone = "966" + rawPhone.slice(1);
                                  const a = document.createElement("a");
                                  a.href = `https://wa.me/${rawPhone || ""}?text=${encodeURIComponent(msg)}`;
                                  a.target = "_blank"; a.rel = "noopener noreferrer";
                                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                                  setReviewSentRevIds((prev) => new Set([...prev, row.bookingId]));
                                  toast({ title: "تم إرسال طلب التقييم ✓", description: `تم فتح واتساب لإرسال رابط التقييم إلى ${row.clientName}` });
                                }
                              } finally {
                                setReviewPendingRevId(null);
                              }
                            }}
                            className="flex items-center gap-1 text-[11px] font-medium text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg px-2 py-1 hover:bg-teal-100 transition-colors disabled:opacity-50 whitespace-nowrap"
                          >
                            {revPending ? <Loader2 className="w-3 h-3 animate-spin" /> : revSent ? <CheckCircle className="w-3 h-3" /> : <Star className="w-3 h-3" />}
                            {revSent ? "تم ✓" : "طلب تقييم"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30">
                  <td colSpan={3} className="py-2 px-3 text-xs font-bold text-muted-foreground">المجموع</td>
                  <td className="py-2 px-3 text-left font-extrabold text-base text-primary tabular-nums">
                    {fmtN(filteredRows.reduce((s, r) => s + r.amount, 0))} <span className="text-xs font-normal text-muted-foreground">ر.س</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Damage Deductions sub-section */}
      {rows.filter(r => r.type === "damage").length > 0 && (
        <div className="bg-card border border-red-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-base">✂️</span>
            <h3 className="font-bold text-sm text-red-700">سجل خصومات التأمين (تلفيات)</h3>
          </div>
          <div className="space-y-2">
            {rows.filter(r => r.type === "damage").map((row, i) => {
              const { hijri, gregorian } = formatDualDate(row.bookingDate);
              const proofImgs: string[] = (() => { try { return JSON.parse(row.proofImages ?? "[]"); } catch { return []; } })();
              const base = import.meta.env.BASE_URL.replace(/\/$/, "");
              return (
                <div key={i} className="rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 p-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-sm text-foreground">{row.clientName}</div>
                      <div className="text-[11px] text-muted-foreground">{hijri} | {gregorian}</div>
                      {row.reason && <div className="text-xs text-red-700 mt-0.5">📋 {row.reason}</div>}
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-xl font-bold text-red-600 tabular-nums">{fmtN(row.amount)} <span className="text-xs font-normal">ر.س</span></div>
                    </div>
                  </div>
                  {proofImgs.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex gap-1">
                        {proofImgs.slice(0, 3).map((u, pi) => {
                          const fu = u.startsWith("http") ? u : `${window.location.origin}${base}${u}`;
                          return (
                            <button key={pi} type="button" onClick={() => setProofTarget(row.booking)} className="w-10 h-10 rounded overflow-hidden bg-muted border">
                              <img src={fu} alt="" className="w-full h-full object-cover" />
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" onClick={() => setProofTarget(row.booking)} className="text-xs text-purple-600 underline">
                        📸 عرض الإثبات ({toAr(proofImgs.length)})
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ProofViewerDialog booking={proofTarget} open={!!proofTarget} onClose={() => setProofTarget(null)} />
    </div>
  );
}

/* ── Reports Tab ─────────────────────────────── */
interface MonthReport {
  month: string;
  totalBookings: number;
  platformBookings: number;
  externalBookings: number;
  totalDays: number;
  daysInMonth: number;
  occupancyRate: number;
  slotStats: { morning: number; evening: number; full_day: number; unspecified: number };
  topSlot: string;
  topSlotLabel: string;
}

/* ── Expense Categories ──────────────────────────── */
const EXPENSE_CATS: { key: string; label: string; emoji: string; color: string }[] = [
  { key: "salaries",    label: "الرواتب",       emoji: "💰", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  { key: "electricity", label: "الكهرباء",      emoji: "⚡", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300" },
  { key: "water",       label: "الماء",          emoji: "💧", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300" },
  { key: "internet",    label: "الإنترنت",       emoji: "🌐", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
  { key: "maintenance", label: "الصيانة",        emoji: "🔧", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
  { key: "supplies",    label: "المستلزمات",     emoji: "📦", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  { key: "other",       label: "أخرى",           emoji: "✨", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
];
const catMap = Object.fromEntries(EXPENSE_CATS.map((c) => [c.key, c]));

async function uploadFile(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append("file", file);
  try {
    const r = await fetch(`${BASE}/api/storage/uploads/process`, {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    if (!r.ok) return null;
    const data = await r.json();
    return data.url ?? data.originalUrl ?? null;
  } catch { return null; }
}

function formatAmount(n: number) {
  return new Intl.NumberFormat("ar-SA", { style: "currency", currency: "SAR", maximumFractionDigits: 0 }).format(n);
}

/* ── Expenses Tab ────────────────────────────────── */
interface OwnerExpense {
  id: number;
  category: string;
  customCategory: string | null;
  dateStr: string;
  amount: string;
  notes: string | null;
  receiptUrl: string | null;
  submissionId: number | null;
}

interface ExpenseCatItem {
  id: number;
  name: string;
  emoji: string;
  color: string;
  isOther: boolean;
  sortOrder: number;
}

const COLOR_CLASSES: Record<string, string> = {
  blue:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  yellow: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  cyan:   "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  purple: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  green:  "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  slate:  "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  red:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  pink:   "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
  teal:   "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

function catColorClass(color: string) {
  return COLOR_CLASSES[color] ?? COLOR_CLASSES.slate;
}

function ExpensesTab() {
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const qc = useQueryClient();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [form, setForm] = useState({ categoryId: "", dateStr: new Date().toISOString().slice(0, 10), amount: "", notes: "", customCategory: "", submissionId: "" });
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  /* ── dynamic categories ── */
  const { data: expenseCats = [] } = useQuery<ExpenseCatItem[]>({
    queryKey: ["catalog", "expense-categories"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/expense-categories`, { credentials: "include" });
      if (!r.ok) return EXPENSE_CATS.map((c, i) => ({ id: i + 1, name: c.label, emoji: c.emoji, color: c.key === "other" ? "slate" : c.color.split("-")[1] ?? "slate", isOther: c.key === "other", sortOrder: i }));
      return r.json();
    },
  });

  useEffect(() => {
    if (expenseCats.length > 0 && !form.categoryId) {
      setForm((f) => ({ ...f, categoryId: String(expenseCats[0].id) }));
    }
  }, [expenseCats]);

  const selectedCat = expenseCats.find((c) => String(c.id) === form.categoryId);
  const isOtherSelected = selectedCat?.isOther ?? false;

  /* combined lookup for list display (supports both old enum keys + new names) */
  const catDisplayMap = useMemo(() => {
    const map: Record<string, { label: string; emoji: string; colorClass: string }> = {};
    for (const c of expenseCats) {
      map[c.name] = { label: c.name, emoji: c.emoji, colorClass: catColorClass(c.color) };
    }
    for (const c of EXPENSE_CATS) {
      map[c.key] = { label: c.label, emoji: c.emoji, colorClass: c.color };
    }
    return map;
  }, [expenseCats]);

  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
      opts.push({ val, label });
    }
    return opts;
  }, []);

  const { data: mySubmissions = [] } = useQuery<any[]>({
    queryKey: ["my-submissions-for-report"],
    queryFn: async () => {
      const r = await apiFetch("/submissions/mine");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: expenses = [], isLoading } = useQuery<OwnerExpense[]>({
    queryKey: ["owner", "expenses", month],
    queryFn: async () => {
      const r = await apiFetch(`/owner/expenses?month=${month}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/owner/expenses", { method: "POST", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("فشل الحفظ");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "expenses"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
      setForm((f) => ({ ...f, amount: "", notes: "", customCategory: "" }));
      setReceiptUrl(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/owner/expenses/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "expenses"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
    },
  });

  async function handleReceiptUpload(file: File) {
    setUploading(true);
    const url = await uploadFile(file);
    setReceiptUrl(url);
    setUploading(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isReadOnly) { onBlockedEdit(); return; }
    const amt = parseFloat(form.amount);
    if (!amt || isNaN(amt)) return;
    if (isOtherSelected && !form.customCategory.trim()) return;
    addMutation.mutate({
      category: selectedCat?.name ?? "أخرى",
      customCategory: isOtherSelected ? form.customCategory.trim() : undefined,
      dateStr: form.dateStr,
      amount: amt,
      notes: form.notes || undefined,
      receiptUrl: receiptUrl || undefined,
      submissionId: form.submissionId ? Number(form.submissionId) : undefined,
    });
  }

  const totalMonth = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div className="space-y-5">
      {/* Quick Entry Form */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          تسجيل مصروف جديد
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Row 1: Category + Amount */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-muted-foreground font-medium mb-1 block">الفئة</label>
              <Select value={form.categoryId} onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v, customCategory: "" }))}>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder="اختر الفئة" />
                </SelectTrigger>
                <SelectContent>
                  {expenseCats.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.emoji} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[120px]">
              <label className="text-xs text-muted-foreground font-medium mb-1 block">المبلغ (ر.س)</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className="h-11"
                required
              />
            </div>
          </div>
          {/* Custom category name — shown only when isOther category is selected */}
          {isOtherSelected && (
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1 block">
                اسم المصروف <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="مثال: تنظيف المكيفات، صيانة مسبح..."
                value={form.customCategory}
                onChange={(e) => setForm((f) => ({ ...f, customCategory: e.target.value }))}
                className="h-11"
                required
              />
            </div>
          )}

          {/* Row 2: Date + Property */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[140px]">
              <label className="text-xs text-muted-foreground font-medium mb-1 block">التاريخ</label>
              <div className="rounded-md border bg-background px-3 py-2 h-11 flex items-center">
                <DualCalendarPicker
                  value={form.dateStr}
                  onChange={(v) => setForm((f) => ({ ...f, dateStr: v }))}
                  placeholder="اختر التاريخ"
                />
              </div>
            </div>
            {mySubmissions.length > 0 && (
              <div className="flex-1 min-w-[140px]">
                <label className="text-xs text-muted-foreground font-medium mb-1 block">العقار (اختياري)</label>
                <Select value={form.submissionId || "none"} onValueChange={(v) => setForm((f) => ({ ...f, submissionId: v === "none" ? "" : v }))}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="عام" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">عام (غير مرتبط)</SelectItem>
                    {mySubmissions.map((s: any) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.nameAr ?? `شاليه #${s.id}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {/* Row 3: Notes */}
          <div>
            <label className="text-xs text-muted-foreground font-medium mb-1 block">ملاحظات (اختياري)</label>
            <Input
              placeholder="تفاصيل إضافية..."
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="h-11"
            />
          </div>
          {/* Row 4: Receipt upload */}
          <div className="flex items-center gap-3">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleReceiptUpload(e.target.files[0])} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {receiptUrl ? "تم رفع الإيصال ✓" : "رفع إيصال (اختياري)"}
            </button>
            {receiptUrl && (
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary underline">عرض</a>
            )}
          </div>
          <Button type="submit" className="w-full h-11 font-bold" disabled={addMutation.isPending || !form.amount}>
            {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <Plus className="w-4 h-4 me-2" />}
            تسجيل المصروف
          </Button>
        </form>
      </div>

      {/* Month Filter + List */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" />
            المصروفات
          </h2>
          <div className="flex items-center gap-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-9 text-sm w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={o.val} value={o.val}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Receipt className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا توجد مصروفات في هذا الشهر</p>
          </div>
        ) : (
          <div className="space-y-2">
            {expenses.map((exp) => {
              const cat = catDisplayMap[exp.category] ?? { label: exp.category, emoji: "✨", colorClass: "bg-slate-100 text-slate-700" };
              const displayLabel = exp.customCategory ? exp.customCategory : cat.label;
              return (
                <div key={exp.id} className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold shrink-0 ${cat.colorClass}`}>
                    {cat.emoji} {displayLabel}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground">{formatAmount(Number(exp.amount))}</p>
                    <p className="text-xs text-muted-foreground truncate">{exp.dateStr}{exp.notes ? ` · ${exp.notes}` : ""}</p>
                  </div>
                  {exp.receiptUrl && (
                    <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className="text-xs text-primary shrink-0">
                      <Receipt className="w-4 h-4" />
                    </a>
                  )}
                  <button
                    onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } if (confirm("حذف هذا المصروف؟")) deleteMutation.mutate(exp.id); }}
                    className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {expenses.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">إجمالي الشهر</span>
            <span className="text-lg font-bold text-destructive">{formatAmount(totalMonth)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Salary Voucher Printer ──────────────────────── */
interface VoucherData {
  voucherNo: string;
  logId?: number;
  staffName: string;
  ownerName: string;
  month: string;
  paidAt: string;
  baseSalary: number;
  bonus: number;
  deduction: number;
  net: number;
  notes?: string;
  qrDataUrl?: string;
}

async function buildVoucherQR(logId: number | undefined, voucherNo: string): Promise<string> {
  try {
    const verifyUrl = logId
      ? `${window.location.origin}/dashboard?tab=staff&verify=${logId}`
      : `${window.location.origin}/dashboard?voucher=${encodeURIComponent(voucherNo)}`;
    return await QRCode.toDataURL(verifyUrl, {
      margin: 1,
      width: 180,
      color: { dark: "#1a1a1a", light: "#ffffff" },
    });
  } catch { return ""; }
}

function printSalaryVoucher(v: VoucherData) {
  const win = window.open("", "_blank", "width=794,height=1123");
  if (!win) return;
  const monthStr = monthLabel(v.month);
  const dateStr = new Date(v.paidAt).toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
  win.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>مسيّر رواتب – ${v.staffName}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background:#fff; color:#111; direction:rtl; }
  .page { max-width: 794px; margin: 0 auto; padding: 40px 48px; min-height: 1123px; position: relative; }
  /* header */
  .header { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 16px; border-bottom: 3px solid #b8860b; padding-bottom: 18px; margin-bottom: 24px; }
  .brand { display: flex; flex-direction: column; gap: 2px; }
  .brand-name { font-size: 26px; font-weight: 800; color: #b8860b; letter-spacing: -0.5px; }
  .brand-sub  { font-size: 12px; color: #666; }
  .voucher-badge { background: #b8860b; color: #fff; border-radius: 10px; padding: 8px 18px; text-align: center; }
  .voucher-badge-title { font-size: 15px; font-weight: 700; }
  .voucher-badge-no   { font-size: 11px; opacity: .85; margin-top: 2px; }
  /* QR */
  .qr-section { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
  .qr-section img { width: 80px; height: 80px; border: 1px solid #e0d8c0; border-radius: 6px; padding: 2px; }
  .qr-caption { font-size: 9px; color: #999; text-align: center; }
  /* meta grid */
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
  .meta-item { background: #faf9f6; border: 1px solid #e8e2d0; border-radius: 8px; padding: 10px 14px; }
  .meta-label { font-size: 11px; color: #888; margin-bottom: 3px; }
  .meta-value { font-size: 14px; font-weight: 600; color: #111; }
  /* salary table */
  .salary-table { width: 100%; border-collapse: collapse; margin-bottom: 28px; font-size: 14px; }
  .salary-table th { background: #b8860b; color: #fff; padding: 10px 14px; text-align: right; font-weight: 600; }
  .salary-table td { padding: 10px 14px; border-bottom: 1px solid #ede9dd; }
  .salary-table tr:nth-child(even) td { background: #faf9f6; }
  .salary-table .total-row td { font-weight: 700; font-size: 16px; border-top: 2px solid #b8860b; background: #fffbf0; }
  .pos { color: #16a34a; }
  .neg { color: #dc2626; }
  .amount { font-variant-numeric: tabular-nums; }
  /* notes */
  .notes-box { background: #faf9f6; border: 1px solid #e8e2d0; border-radius: 8px; padding: 12px 14px; margin-bottom: 28px; font-size: 13px; color: #444; }
  .notes-box strong { color: #111; display: block; margin-bottom: 4px; }
  /* signatures */
  .sig-section { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 32px; }
  .sig-box { display: flex; flex-direction: column; gap: 8px; }
  .sig-label { font-size: 13px; font-weight: 600; color: #555; }
  .sig-name  { font-size: 15px; font-weight: 700; color: #111; }
  .sig-line  { border-bottom: 1.5px solid #999; margin-top: 40px; }
  .sig-caption { font-size: 11px; color: #999; margin-top: 4px; }
  /* footer */
  .footer { position: absolute; bottom: 32px; left: 48px; right: 48px; text-align: center; font-size: 11px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px; }
  /* print */
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { padding: 20px 30px; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="page">
  <!-- Header -->
  <div class="header">
    <div class="brand">
      <div class="brand-name">حكاية أناقة</div>
      <div class="brand-sub">منصة إدارة الشاليهات – القصيم</div>
    </div>
    <div class="voucher-badge">
      <div class="voucher-badge-title">مسيّر رواتب</div>
      <div class="voucher-badge-no"># ${v.voucherNo}</div>
    </div>
    ${v.qrDataUrl ? `<div class="qr-section">
      <img src="${v.qrDataUrl}" alt="QR للتحقق"/>
      <div class="qr-caption">امسح للتحقق</div>
    </div>` : '<div></div>'}
  </div>

  <!-- Meta -->
  <div class="meta">
    <div class="meta-item">
      <div class="meta-label">اسم الموظف</div>
      <div class="meta-value">${v.staffName}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">اسم صاحب العمل</div>
      <div class="meta-value">${v.ownerName}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">فترة الراتب</div>
      <div class="meta-value">${monthStr}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">تاريخ الصرف</div>
      <div class="meta-value">${dateStr}</div>
    </div>
  </div>

  <!-- Salary Breakdown -->
  <table class="salary-table">
    <thead>
      <tr><th>البيان</th><th>المبلغ (ر.س)</th></tr>
    </thead>
    <tbody>
      <tr><td>الراتب الأساسي</td><td class="amount">${v.baseSalary.toLocaleString("ar-SA")}</td></tr>
      ${v.bonus > 0 ? `<tr><td class="pos">مكافأة / بدل</td><td class="pos amount">+ ${v.bonus.toLocaleString("ar-SA")}</td></tr>` : ""}
      ${v.deduction > 0 ? `<tr><td class="neg">خصومات</td><td class="neg amount">- ${v.deduction.toLocaleString("ar-SA")}</td></tr>` : ""}
      <tr class="total-row"><td>صافي الراتب المستحق</td><td class="amount">${v.net.toLocaleString("ar-SA")} ر.س</td></tr>
    </tbody>
  </table>

  ${v.notes ? `<div class="notes-box"><strong>ملاحظات:</strong>${v.notes}</div>` : ""}

  <!-- Signatures -->
  <div class="sig-section">
    <div class="sig-box">
      <div class="sig-label">توقيع صاحب العمل</div>
      <div class="sig-name">${v.ownerName}</div>
      <div class="sig-line"></div>
      <div class="sig-caption">التوقيع والختم</div>
    </div>
    <div class="sig-box">
      <div class="sig-label">توقيع الموظف / إقرار الاستلام</div>
      <div class="sig-name">${v.staffName}</div>
      <div class="sig-line"></div>
      <div class="sig-caption">التوقيع بما يفيد الاستلام</div>
    </div>
  </div>

  <div class="footer">
    تم إصدار هذا المسيّر إلكترونياً عبر منصة حكاية أناقة · ${new Date().getFullYear()}
  </div>
</div>
<script>window.onload = function(){ window.print(); };<\/script>
</body></html>`);
  win.document.close();
}

/* ── Staff & Salaries Tab ────────────────────────── */
interface StaffMember { id: number; name: string; username: string | null; baseSalary: string; isActive: boolean; permissions: StaffPermissions; createdAt: string; }
interface SalaryLog {
  id: number;
  staffId: number;
  staffName?: string;
  baseSalary?: string;
  month: string;
  bonus: string;
  deduction: string;
  notes: string | null;
  paidAt?: string | null;
  expenseId?: number | null;
}

/** next payment month string after lastPaidMonth (YYYY-MM) */
function nextDueMonth(lastPaidMonth: string | null): string {
  if (!lastPaidMonth) return new Date().toISOString().slice(0, 7);
  const [y, m] = lastPaidMonth.split("-").map(Number);
  const d = new Date(y, m, 1); // month is 0-indexed, so m is already next
  return d.toISOString().slice(0, 7);
}

function monthLabel(ym: string) {
  return new Date(ym + "-15").toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
}

/* ── Bulk Voucher Printer ─────────────────────── */
async function printBulkVouchers(logs: any[], ownerName: string) {
  if (logs.length === 0) return;
  const win = window.open("", "_blank", "width=900,height=1200");
  if (!win) return;

  const pages: string[] = [];
  for (const log of logs) {
    const base = Number(log.baseSalary ?? 0);
    const bonus = Number(log.bonus);
    const deduction = Number(log.deduction);
    const net = base + bonus - deduction;
    const paidAtStr = log.paidAt ? String(log.paidAt) : new Date().toISOString();
    const voucherNo = `SAL-${log.month.replace("-","")}-${log.staffId}`;
    const dateStr = new Date(paidAtStr).toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
    const monthStr = monthLabel(log.month);
    const qrDataUrl = await buildVoucherQR(log.id, voucherNo);
    const qrHtml = qrDataUrl ? `<div class="qr-section"><img src="${qrDataUrl}" alt="QR"/><div class="qr-cap">امسح للتحقق</div></div>` : "";

    pages.push(`
<div class="page" style="page-break-after:always;">
  <div class="header">
    <div class="brand"><div class="brand-name">حكاية أناقة</div><div class="brand-sub">منصة إدارة الشاليهات – القصيم</div></div>
    <div class="badge"><div class="badge-title">مسيّر رواتب</div><div class="badge-no"># ${voucherNo}</div></div>
    ${qrHtml}
  </div>
  <div class="meta">
    <div class="meta-item"><div class="meta-label">اسم الموظف</div><div class="meta-val">${log.staffName ?? "—"}</div></div>
    <div class="meta-item"><div class="meta-label">صاحب العمل</div><div class="meta-val">${ownerName}</div></div>
    <div class="meta-item"><div class="meta-label">فترة الراتب</div><div class="meta-val">${monthStr}</div></div>
    <div class="meta-item"><div class="meta-label">تاريخ الصرف</div><div class="meta-val">${dateStr}</div></div>
  </div>
  <table class="sal-table">
    <thead><tr><th>البند</th><th>المبلغ (ر.س)</th></tr></thead>
    <tbody>
      <tr><td>الراتب الأساسي</td><td>${base.toLocaleString("ar-SA")}</td></tr>
      ${bonus > 0 ? `<tr><td>مكافأة</td><td class="green">+${bonus.toLocaleString("ar-SA")}</td></tr>` : ""}
      ${deduction > 0 ? `<tr><td>خصم</td><td class="red">-${deduction.toLocaleString("ar-SA")}</td></tr>` : ""}
    </tbody>
    <tfoot><tr><td>الصافي</td><td class="net">${net.toLocaleString("ar-SA")}</td></tr></tfoot>
  </table>
  ${log.notes ? `<div class="notes">ملاحظات: ${log.notes}</div>` : ""}
  <div class="sigs"><div class="sig"><div class="sig-line"></div><p>توقيع صاحب العمل</p></div><div class="sig"><div class="sig-line"></div><p>توقيع الموظف</p></div></div>
</div>`);
  }

  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; color:#111; }
.page { max-width:794px; margin:0 auto; padding:40px 48px; min-height:1123px; position:relative; }
.header { display:grid; grid-template-columns:1fr auto 1fr; align-items:center; gap:16px; border-bottom:3px solid #b8860b; padding-bottom:16px; margin-bottom:20px; }
.brand-name { font-size:24px; font-weight:800; color:#b8860b; }
.brand-sub { font-size:11px; color:#888; }
.badge { background:#b8860b; color:#fff; border-radius:10px; padding:8px 18px; text-align:center; }
.badge-title { font-size:14px; font-weight:700; }
.badge-no { font-size:10px; opacity:.8; }
.qr-section { display:flex; flex-direction:column; align-items:flex-start; gap:3px; }
.qr-section img { width:72px; height:72px; border:1px solid #ddd; border-radius:4px; }
.qr-cap { font-size:8px; color:#aaa; }
.meta { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:20px; }
.meta-item { background:#faf9f6; border:1px solid #e8e2d0; border-radius:8px; padding:10px 12px; }
.meta-label { font-size:10px; color:#999; margin-bottom:2px; }
.meta-val { font-size:13px; font-weight:600; }
.sal-table { width:100%; border-collapse:collapse; margin-bottom:20px; }
.sal-table th,.sal-table td { padding:10px 14px; border:1px solid #e8e2d0; text-align:right; }
.sal-table thead { background:#b8860b; color:#fff; }
.sal-table tfoot { background:#fff9ed; font-weight:700; }
.green { color:#15803d; } .red { color:#dc2626; } .net { font-size:16px; color:#b8860b; }
.notes { background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:10px 14px; font-size:12px; margin-bottom:20px; }
.sigs { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:30px; }
.sig { text-align:center; } .sig-line { height:1px; background:#ccc; margin-bottom:8px; } .sig p { font-size:11px; color:#888; }
</style></head><body>${pages.join("")}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

async function printMasterPayroll(filterMonth: string, logs: any[], ownerName: string) {
  const filtered = filterMonth ? logs.filter((l) => l.month === filterMonth) : logs;
  if (filtered.length === 0) return;
  const win = window.open("", "_blank", "width=860,height=700");
  if (!win) return;
  const total = filtered.reduce((s: number, l: any) => {
    const base = Number(l.baseSalary ?? 0);
    return s + base + Number(l.bonus) - Number(l.deduction);
  }, 0);
  const monthStr = filterMonth ? monthLabel(filterMonth) : "كل الشهور";
  const dateNow = new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });

  const rows = filtered.map((l: any, i: number) => {
    const base = Number(l.baseSalary ?? 0);
    const bonus = Number(l.bonus);
    const deduction = Number(l.deduction);
    const net = base + bonus - deduction;
    return `<tr>
      <td>${i + 1}</td>
      <td>${l.staffName ?? "—"}</td>
      <td>${base.toLocaleString("ar-SA")}</td>
      <td style="color:#15803d">${bonus > 0 ? `+${bonus.toLocaleString("ar-SA")}` : "—"}</td>
      <td style="color:#dc2626">${deduction > 0 ? `-${deduction.toLocaleString("ar-SA")}` : "—"}</td>
      <td style="font-weight:700;color:#b8860b">${net.toLocaleString("ar-SA")}</td>
    </tr>`;
  }).join("");

  win.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Segoe UI',Tahoma,Arial,sans-serif; direction:rtl; color:#111; padding:40px 48px; }
h1 { font-size:22px; color:#b8860b; font-weight:800; margin-bottom:4px; }
.sub { font-size:12px; color:#888; margin-bottom:6px; }
.meta-row { display:flex; gap:32px; margin-bottom:20px; font-size:12px; color:#555; }
table { width:100%; border-collapse:collapse; margin-bottom:16px; }
th,td { padding:10px 12px; border:1px solid #e0d8c0; text-align:right; font-size:13px; }
thead { background:#b8860b; color:#fff; }
tfoot { background:#fff9ed; font-weight:700; }
.sig-row { display:grid; grid-template-columns:1fr 1fr; gap:60px; margin-top:40px; }
.sig { text-align:center; } .sig-line { height:1px; background:#ccc; margin-bottom:8px; } .sig p { font-size:11px; color:#888; }
</style></head><body>
<h1>حكاية أناقة — مسيّر رواتب جماعي</h1>
<div class="sub">منصة إدارة الشاليهات – القصيم</div>
<div class="meta-row">
  <span>الشهر: <strong>${monthStr}</strong></span>
  <span>صاحب العمل: <strong>${ownerName}</strong></span>
  <span>تاريخ الطباعة: <strong>${dateNow}</strong></span>
</div>
<table>
  <thead><tr><th>#</th><th>اسم الموظف</th><th>الأساسي</th><th>مكافأة</th><th>خصم</th><th>الصافي (ر.س)</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="5" style="text-align:right">الإجمالي</td><td style="color:#b8860b;font-size:15px">${total.toLocaleString("ar-SA")}</td></tr></tfoot>
</table>
<div class="sig-row">
  <div class="sig"><div class="sig-line"></div><p>توقيع صاحب العمل</p></div>
  <div class="sig"><div class="sig-line"></div><p>المدير المالي / المراجع</p></div>
</div>
</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

/* ──────────────────────────────────────────────── */
function StaffTab() {
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const qc = useQueryClient();
  const { user } = useAuth();
  const currentMonth = new Date().toISOString().slice(0, 7);
  /* ── state ── */
  const [addForm, setAddForm] = useState({ name: "", baseSalary: "", username: "", password: "" });
  const [addPerms, setAddPerms] = useState<StaffPermissions>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", baseSalary: "" });
  /* Permission panel state */
  const [permEditId, setPermEditId] = useState<number | null>(null);
  const [permState, setPermState] = useState<StaffPermissions>({});
  /* Credential edit state */
  const [credEditId, setCredEditId] = useState<number | null>(null);
  const [credForm, setCredForm] = useState({ username: "", password: "" });
  /* Pay dialog */
  const [payTarget, setPayTarget] = useState<StaffMember | null>(null);
  const [payForm, setPayForm] = useState({ month: currentMonth, bonus: "0", deduction: "0", notes: "" });
  /* Voucher (shown in dialog after successful payment) */
  const [paidVoucher, setPaidVoucher] = useState<VoucherData | null>(null);
  /* Bulk print selection */
  const [selectedLogIds, setSelectedLogIds] = useState<Set<number>>(new Set());
  const [masterMonth, setMasterMonth] = useState(currentMonth);

  /* ── month select options ── */
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({ val: d.toISOString().slice(0, 7), label: d.toLocaleDateString("ar-SA", { year: "numeric", month: "long" }) });
    }
    return opts;
  }, []);

  /* ── queries ── */
  const { data: staff = [], isLoading } = useQuery<StaffMember[]>({
    queryKey: ["owner", "staff"],
    queryFn: async () => { const r = await apiFetch("/owner/staff"); if (!r.ok) return []; return r.json(); },
  });

  const { data: history = [], isLoading: histLoading } = useQuery<SalaryLog[]>({
    queryKey: ["owner", "salary-logs-history"],
    queryFn: async () => { const r = await apiFetch("/owner/salary-logs/history"); if (!r.ok) return []; return r.json(); },
  });

  /* ── mutations ── */
  const addStaff = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/owner/staff", { method: "POST", body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "staff"] });
      setAddForm({ name: "", baseSalary: "", username: "", password: "" });
      setAddPerms({});
    },
  });

  const updatePermissions = useMutation({
    mutationFn: async ({ id, permissions }: { id: number; permissions: StaffPermissions }) => {
      const r = await apiFetch(`/owner/staff/${id}/permissions`, { method: "PUT", body: JSON.stringify({ permissions }) });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner", "staff"] }); setPermEditId(null); },
  });

  const updateCredentials = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { username?: string; password?: string } }) => {
      const r = await apiFetch(`/owner/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner", "staff"] }); setCredEditId(null); },
  });

  const editStaff = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const r = await apiFetch(`/owner/staff/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner", "staff"] }); setEditId(null); },
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/owner/staff/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "staff"] }),
  });

  const paySalary = useMutation({
    mutationFn: async (data: any) => {
      const r = await apiFetch("/owner/salary-logs/pay", { method: "POST", body: JSON.stringify(data) });
      if (!r.ok) throw new Error("فشل صرف الراتب");
      return r.json() as Promise<{ salaryLog: any; expense: any }>;
    },
    onSuccess: async (result, variables) => {
      qc.invalidateQueries({ queryKey: ["owner", "salary-logs-history"] });
      qc.invalidateQueries({ queryKey: ["owner", "expenses"] });
      qc.invalidateQueries({ queryKey: ["owner", "financial-summary"] });
      /* Build voucher data (with QR) from the result + payTarget context */
      if (payTarget) {
        const base  = Number(payTarget.baseSalary);
        const bonus = variables.bonus ?? 0;
        const deduction = variables.deduction ?? 0;
        const net   = base + bonus - deduction;
        const paidAt = result.salaryLog?.paidAt ?? new Date().toISOString();
        const logId  = result.salaryLog?.id as number | undefined;
        const voucherNo = `SAL-${new Date().getFullYear()}${String(new Date().getMonth()+1).padStart(2,"0")}-${payTarget.id}`;
        const qrDataUrl = await buildVoucherQR(logId, voucherNo);
        setPaidVoucher({
          voucherNo,
          logId,
          staffName:  payTarget.name,
          ownerName:  [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "صاحب العمل",
          month:      variables.month,
          paidAt,
          baseSalary: base,
          bonus,
          deduction,
          net,
          notes:      variables.notes,
          qrDataUrl,
        });
      }
      setPayForm({ month: currentMonth, bonus: "0", deduction: "0", notes: "" });
    },
  });

  /* ── per-staff computed stats from history ── */
  const staffStats = useMemo(() => {
    const map: Record<number, { totalEarned: number; lastPaidMonth: string | null }> = {};
    for (const log of history) {
      if (!map[log.staffId]) map[log.staffId] = { totalEarned: 0, lastPaidMonth: null };
      const base = Number((log as any).baseSalary ?? 0);
      const net = base + Number(log.bonus) - Number(log.deduction);
      map[log.staffId].totalEarned += net;
      const prev = map[log.staffId].lastPaidMonth;
      if (!prev || log.month > prev) map[log.staffId].lastPaidMonth = log.month;
    }
    return map;
  }, [history]);

  /* ── pay dialog net salary ── */
  const payNet = payTarget
    ? Number(payTarget.baseSalary) + (parseFloat(payForm.bonus) || 0) - (parseFloat(payForm.deduction) || 0)
    : 0;

  return (
    <div className="space-y-5">
      {/* ── Add Staff Form ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-primary" />
          إضافة موظف جديد
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (isReadOnly) { onBlockedEdit(); return; }
            const s = parseFloat(addForm.baseSalary);
            if (!addForm.name || isNaN(s)) return;
            addStaff.mutate({
              name: addForm.name,
              baseSalary: s,
              username: addForm.username || undefined,
              password: addForm.password || undefined,
              permissions: addPerms,
            });
          }}
          className="space-y-4"
        >
          {/* Basic Info */}
          <div className="flex gap-3 flex-wrap">
            <Input placeholder="الاسم الكامل" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className="flex-1 min-w-[140px] h-11" required />
            <Input type="number" min="0" step="1" placeholder="الراتب الأساسي (ر.س)" value={addForm.baseSalary} onChange={(e) => setAddForm((f) => ({ ...f, baseSalary: e.target.value }))} className="flex-1 min-w-[160px] h-11" required />
          </div>

          {/* Login Credentials */}
          <div className="border border-border/60 rounded-xl p-4 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> بيانات دخول الموظف (اختياري)
            </p>
            <div className="flex gap-3 flex-wrap">
              <Input
                placeholder="اسم المستخدم (لتسجيل الدخول)"
                value={addForm.username}
                onChange={(e) => setAddForm((f) => ({ ...f, username: e.target.value }))}
                className="flex-1 min-w-[150px] h-10 text-sm"
                dir="ltr"
              />
              <Input
                type="password"
                placeholder="كلمة المرور (٦ أحرف أو أكثر)"
                value={addForm.password}
                onChange={(e) => setAddForm((f) => ({ ...f, password: e.target.value }))}
                className="flex-1 min-w-[150px] h-10 text-sm"
                dir="ltr"
              />
            </div>
          </div>

          {/* Permissions */}
          <div className="border border-border/60 rounded-xl p-4 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground mb-3 flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5" /> صلاحيات الموظف
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALL_PERM_KEYS.map((key) => {
                const info = PERM_LABELS[key];
                return (
                  <label key={key} className="flex items-start gap-3 cursor-pointer group">
                    <Switch
                      checked={!!addPerms[key]}
                      onCheckedChange={(v) => setAddPerms((p) => ({ ...p, [key]: v }))}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-xs">
                      <span className="font-semibold text-foreground">{info.icon} {info.label}</span>
                      <span className="block text-muted-foreground mt-0.5">{info.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <Button type="submit" className="h-11 px-5 font-bold w-full sm:w-auto" disabled={addStaff.isPending}>
            <Plus className="w-4 h-4 me-1.5" />
            إضافة الموظف
          </Button>
        </form>
      </div>

      {/* ── Staff Cards ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h2 className="text-base font-bold text-foreground mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          الموظفون
        </h2>

        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        ) : staff.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">لا يوجد موظفون مسجلون بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {staff.map((member) => {
              const stats = staffStats[member.id] ?? { totalEarned: 0, lastPaidMonth: null };
              const nextDue = nextDueMonth(stats.lastPaidMonth);
              const nextDueLabel = monthLabel(nextDue);
              const isDueThisMonth = nextDue === currentMonth;

              return (
                <div key={member.id} className="border border-border rounded-2xl overflow-hidden">
                  <div className="flex items-start gap-4 p-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-6 h-6 text-primary" />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {editId === member.id ? (
                        <div className="flex gap-2 flex-wrap">
                          <Input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="flex-1 min-w-[120px] h-8 text-sm" placeholder="الاسم" />
                          <Input type="number" value={editForm.baseSalary} onChange={(e) => setEditForm((f) => ({ ...f, baseSalary: e.target.value }))} className="w-32 h-8 text-sm" placeholder="الراتب" />
                          <Button size="sm" disabled={isReadOnly} onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } editStaff.mutate({ id: member.id, data: { name: editForm.name, baseSalary: parseFloat(editForm.baseSalary) } }); }}>حفظ</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>إلغاء</Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-bold text-foreground">{member.name}</p>
                            {!member.username && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">
                                <Lock className="w-2.5 h-2.5" />
                                لا يمكنه الدخول — أضف بيانات تسجيل الدخول
                              </span>
                            )}
                            {member.username && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-100 rounded-full px-2 py-0.5">
                                <LogIn className="w-2.5 h-2.5" />
                                @{member.username}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">الراتب الأساسي: <span className="font-semibold text-foreground">{formatAmount(Number(member.baseSalary))}</span></p>
                        </>
                      )}

                      {/* Stats row */}
                      {editId !== member.id && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="bg-green-50 dark:bg-green-950/30 rounded-xl px-3 py-2">
                            <p className="text-[10px] text-muted-foreground mb-0.5">إجمالي المصروف</p>
                            <p className="text-sm font-bold text-green-700 dark:text-green-400">{formatAmount(stats.totalEarned)}</p>
                          </div>
                          <div className={`rounded-xl px-3 py-2 ${isDueThisMonth ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/50"}`}>
                            <p className="text-[10px] text-muted-foreground mb-0.5">موعد الراتب القادم</p>
                            <p className={`text-sm font-bold ${isDueThisMonth ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                              {nextDueLabel} {isDueThisMonth ? "⚠️" : ""}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        {editId !== member.id && (
                          <button onClick={() => { setEditId(member.id); setEditForm({ name: member.name, baseSalary: member.baseSalary }); }} className="p-2 text-muted-foreground hover:text-foreground transition-colors">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } if (confirm(`حذف ${member.name}؟`)) deleteStaff.mutate(member.id); }} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <Button
                        size="sm"
                        className="h-9 px-4 font-bold text-xs"
                        onClick={() => {
                          setPayTarget(member);
                          setPayForm({ month: nextDue, bonus: "0", deduction: "0", notes: "" });
                        }}
                      >
                        <DollarSign className="w-3.5 h-3.5 me-1" />
                        صرف راتب
                      </Button>
                    </div>
                  </div>

                  {/* ── Permission Summary Row ── */}
                  <div className="border-t border-border/50 px-4 pb-3 pt-2.5 bg-muted/10">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <Settings className="w-3 h-3" /> الصلاحيات
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => {
                            if (permEditId === member.id) { setPermEditId(null); }
                            else {
                              setPermEditId(member.id);
                              setPermState(member.permissions ?? {});
                              setCredEditId(null);
                            }
                          }}
                          className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                        >
                          <Edit2 className="w-2.5 h-2.5" />
                          {permEditId === member.id ? "إغلاق" : "تعديل"}
                        </button>
                        <span className="text-muted-foreground/40">|</span>
                        <button
                          onClick={() => {
                            if (credEditId === member.id) { setCredEditId(null); }
                            else {
                              setCredEditId(member.id);
                              setCredForm({ username: member.username ?? "", password: "" });
                              setPermEditId(null);
                            }
                          }}
                          className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5"
                        >
                          <Lock className="w-2.5 h-2.5" />
                          {credEditId === member.id ? "إغلاق" : "بيانات الدخول"}
                        </button>
                      </div>
                    </div>

                    {/* Permission badges */}
                    {permEditId !== member.id && (
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_PERM_KEYS.filter((k) => member.permissions?.[k]).length === 0 ? (
                          <span className="text-[11px] text-muted-foreground italic">لا توجد صلاحيات ممنوحة</span>
                        ) : (
                          ALL_PERM_KEYS.filter((k) => member.permissions?.[k]).map((k) => (
                            <span key={k} className="inline-flex items-center gap-0.5 text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                              {PERM_LABELS[k].icon} {PERM_LABELS[k].label}
                            </span>
                          ))
                        )}
                      </div>
                    )}

                    {/* Expandable Permission Editor */}
                    {permEditId === member.id && (
                      <div className="mt-2 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {ALL_PERM_KEYS.map((key) => {
                            const info = PERM_LABELS[key];
                            return (
                              <label key={key} className="flex items-start gap-2.5 cursor-pointer">
                                <Switch
                                  checked={!!permState[key]}
                                  onCheckedChange={(v) => setPermState((p) => ({ ...p, [key]: v }))}
                                  className="mt-0.5 shrink-0"
                                />
                                <span className="text-xs">
                                  <span className="font-semibold text-foreground">{info.icon} {info.label}</span>
                                  <span className="block text-muted-foreground mt-0.5 text-[10px]">{info.description}</span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-8 text-xs px-4"
                            disabled={updatePermissions.isPending || isReadOnly}
                            onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } updatePermissions.mutate({ id: member.id, permissions: permState }); }}
                          >
                            حفظ الصلاحيات
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setPermEditId(null)}>إلغاء</Button>
                        </div>
                      </div>
                    )}

                    {/* Expandable Credentials Editor */}
                    {credEditId === member.id && (
                      <div className="mt-2 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">اسم المستخدم</p>
                            <Input
                              value={credForm.username}
                              onChange={(e) => setCredForm((f) => ({ ...f, username: e.target.value }))}
                              placeholder="username"
                              dir="ltr"
                              className="h-8 text-sm"
                            />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">كلمة مرور جديدة (اتركها فارغة للإبقاء)</p>
                            <Input
                              type="password"
                              value={credForm.password}
                              onChange={(e) => setCredForm((f) => ({ ...f, password: e.target.value }))}
                              placeholder="••••••"
                              dir="ltr"
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        {member.username && (
                          <p className="text-[10px] text-muted-foreground">
                            رابط الدخول الحالي: <span className="font-mono text-primary">/staff-login</span>
                            {" "}← اسم المستخدم: <span className="font-mono">{member.username}</span>
                          </p>
                        )}
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="h-8 text-xs px-4"
                            disabled={updateCredentials.isPending || isReadOnly}
                            onClick={() => {
                              if (isReadOnly) { onBlockedEdit(); return; }
                              const data: Record<string, string> = {};
                              if (credForm.username) data.username = credForm.username;
                              if (credForm.password) data.password = credForm.password;
                              updateCredentials.mutate({ id: member.id, data });
                            }}
                          >
                            حفظ بيانات الدخول
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setCredEditId(null)}>إلغاء</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Payment History Table ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            سجل صرف الرواتب
          </h2>
          {history.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Master payroll month picker */}
              <Select value={masterMonth} onValueChange={setMasterMonth}>
                <SelectTrigger className="h-8 text-xs w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (
                    <SelectItem key={o.val} value={o.val}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => {
                  const ownerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "صاحب العمل";
                  printMasterPayroll(masterMonth, history as any[], ownerName);
                }}
              >
                <Receipt className="w-3.5 h-3.5" />
                مسيّر جماعي
              </Button>
              {selectedLogIds.size > 0 && (
                <Button
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={async () => {
                    const ownerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "صاحب العمل";
                    const selected = (history as any[]).filter((l) => selectedLogIds.has(l.id));
                    await printBulkVouchers(selected, ownerName);
                  }}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  طباعة المسيرات ({selectedLogIds.size})
                </Button>
              )}
            </div>
          )}
        </div>
        {histLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Receipt className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">لم يتم صرف أي راتب بعد</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="pb-3 w-8">
                    <input
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded accent-primary"
                      checked={selectedLogIds.size === history.length && history.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedLogIds(new Set((history as any[]).map((l) => l.id)));
                        else setSelectedLogIds(new Set());
                      }}
                    />
                  </th>
                  <th className="text-right pb-3 font-semibold">الموظف</th>
                  <th className="text-right pb-3 font-semibold">الشهر</th>
                  <th className="text-right pb-3 font-semibold">الأساسي</th>
                  <th className="text-right pb-3 font-semibold">مكافأة</th>
                  <th className="text-right pb-3 font-semibold">خصم</th>
                  <th className="text-right pb-3 font-semibold">الصافي</th>
                  <th className="text-right pb-3 font-semibold">تاريخ الصرف</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((log) => {
                  const base = Number((log as any).baseSalary ?? 0);
                  const bonus = Number(log.bonus);
                  const deduction = Number(log.deduction);
                  const net = base + bonus - deduction;
                  const paidAtStr = log.paidAt ? String(log.paidAt) : new Date().toISOString();
                  const voucherNo = `SAL-${log.month.replace("-","")}-${log.staffId}`;
                  const isSelected = selectedLogIds.has(log.id);
                  return (
                    <tr key={log.id} className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                      <td className="py-3">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded accent-primary"
                          checked={isSelected}
                          onChange={(e) => {
                            const next = new Set(selectedLogIds);
                            if (e.target.checked) next.add(log.id);
                            else next.delete(log.id);
                            setSelectedLogIds(next);
                          }}
                        />
                      </td>
                      <td className="py-3 font-semibold text-foreground">{(log as any).staffName ?? "—"}</td>
                      <td className="py-3 text-muted-foreground">{monthLabel(log.month)}</td>
                      <td className="py-3">{formatAmount(base)}</td>
                      <td className="py-3 text-green-600">{bonus > 0 ? `+${formatAmount(bonus)}` : "—"}</td>
                      <td className="py-3 text-red-600">{deduction > 0 ? `-${formatAmount(deduction)}` : "—"}</td>
                      <td className="py-3 font-bold text-foreground">{formatAmount(net)}</td>
                      <td className="py-3 text-muted-foreground text-xs">
                        {log.paidAt ? new Date(paidAtStr).toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                      </td>
                      <td className="py-3">
                        <button
                          onClick={async () => {
                            const qrDataUrl = await buildVoucherQR(log.id, voucherNo);
                            printSalaryVoucher({
                              voucherNo,
                              logId:      log.id,
                              staffName:  (log as any).staffName ?? "موظف",
                              ownerName:  [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "صاحب العمل",
                              month:      log.month,
                              paidAt:     paidAtStr,
                              baseSalary: base,
                              bonus,
                              deduction,
                              net,
                              notes:      log.notes ?? undefined,
                              qrDataUrl,
                            });
                          }}
                          className="flex items-center gap-1 text-xs text-primary hover:underline whitespace-nowrap"
                        >
                          <Receipt className="w-3 h-3" />
                          طباعة
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Pay Salary Dialog ── */}
      <Dialog
        open={!!payTarget}
        onOpenChange={(open) => {
          if (!open) { setPayTarget(null); setPaidVoucher(null); }
        }}
      >
        <DialogContent className="max-w-sm" dir="rtl">
          {/* ── Success / Voucher state ── */}
          {paidVoucher ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-right text-green-600">
                  <CheckCircle className="w-5 h-5" />
                  تم صرف الراتب بنجاح
                </DialogTitle>
                <DialogDescription className="text-right text-xs">
                  تمت إضافة الراتب تلقائياً في المصروفات تحت بند الرواتب.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Mini summary */}
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الموظف</span>
                    <span className="font-semibold">{paidVoucher.staffName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الشهر</span>
                    <span className="font-semibold">{monthLabel(paidVoucher.month)}</span>
                  </div>
                  <div className="flex justify-between border-t border-green-200 dark:border-green-800 pt-2 font-bold">
                    <span>صافي الراتب</span>
                    <span className="text-green-700 dark:text-green-400 text-base">{formatAmount(paidVoucher.net)}</span>
                  </div>
                </div>
                <Button
                  className="w-full h-11 font-bold"
                  onClick={() => printSalaryVoucher(paidVoucher)}
                >
                  <Receipt className="w-4 h-4 me-2" />
                  طباعة مسيّر الراتب (PDF)
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-10"
                  onClick={() => { setPayTarget(null); setPaidVoucher(null); }}
                >
                  إغلاق
                </Button>
              </div>
            </>
          ) : (
            /* ── Pay Form state ── */
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-right">
                  <DollarSign className="w-5 h-5 text-primary" />
                  صرف راتب – {payTarget?.name}
                </DialogTitle>
                <DialogDescription className="text-right text-xs">
                  سيتم تسجيل الراتب تلقائياً ضمن المصروفات تحت بند الرواتب.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {/* Month picker */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1 block">الشهر</label>
                  <Select value={payForm.month} onValueChange={(v) => setPayForm((f) => ({ ...f, month: v }))}>
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {monthOptions.map((o) => <SelectItem key={o.val} value={o.val}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {/* Base salary (read-only) */}
                {payTarget && (
                  <div className="flex items-center justify-between bg-muted/40 rounded-xl px-4 py-2.5 text-sm">
                    <span className="text-muted-foreground">الراتب الأساسي</span>
                    <span className="font-bold">{formatAmount(Number(payTarget.baseSalary))}</span>
                  </div>
                )}
                {/* Bonus + Deduction */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">مكافأة / بدل (+)</label>
                    <Input type="number" min="0" step="1" value={payForm.bonus} onChange={(e) => setPayForm((f) => ({ ...f, bonus: e.target.value }))} className="h-10" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground font-medium mb-1 block">خصومات (-)</label>
                    <Input type="number" min="0" step="1" value={payForm.deduction} onChange={(e) => setPayForm((f) => ({ ...f, deduction: e.target.value }))} className="h-10" />
                  </div>
                </div>
                {/* Reason */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1 block">سبب المكافأة / الخصم (اختياري)</label>
                  <Input placeholder="مثال: مكافأة أداء، غياب..." value={payForm.notes} onChange={(e) => setPayForm((f) => ({ ...f, notes: e.target.value }))} className="h-10" />
                </div>
                {/* Net preview */}
                {payTarget && (
                  <div className="bg-muted/50 rounded-xl p-4 space-y-1.5 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>الأساسي</span><span>{formatAmount(Number(payTarget.baseSalary))}</span>
                    </div>
                    {(parseFloat(payForm.bonus)||0) > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>مكافأة</span><span>+ {formatAmount(parseFloat(payForm.bonus)||0)}</span>
                      </div>
                    )}
                    {(parseFloat(payForm.deduction)||0) > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>خصم</span><span>- {formatAmount(parseFloat(payForm.deduction)||0)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold text-foreground border-t border-border pt-2">
                      <span>صافي الراتب</span>
                      <span className={payNet >= 0 ? "text-green-600" : "text-destructive"}>{formatAmount(payNet)}</span>
                    </div>
                  </div>
                )}
                <Button
                  className="w-full h-11 font-bold"
                  disabled={paySalary.isPending || isReadOnly}
                  onClick={() => {
                    if (isReadOnly) { onBlockedEdit(); return; }
                    if (!payTarget) return;
                    paySalary.mutate({
                      staffId: payTarget.id,
                      month: payForm.month,
                      bonus: parseFloat(payForm.bonus) || 0,
                      deduction: parseFloat(payForm.deduction) || 0,
                      notes: payForm.notes || undefined,
                    });
                  }}
                >
                  {paySalary.isPending ? <Loader2 className="w-4 h-4 animate-spin me-2" /> : <CheckCircle className="w-4 h-4 me-2" />}
                  تأكيد صرف الراتب
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── QR Code helper for report verification links ── */
async function generateReportQrDataUrl(type: "monthly" | "yearly", period: string): Promise<string | null> {
  try {
    const param = type === "monthly" ? `month=${period}` : `year=${period}`;
    const url = `${window.location.origin}${BASE}/dashboard?tab=reports&view=${type}&${param}`;
    return await QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    });
  } catch {
    return null;
  }
}

/* ── PDF Print Functions ────────────────────── */
async function printMonthlyReport(
  month: string,
  propertyName: string,
  report: MonthReport | null | undefined,
  financial: { totalRevenue: number; totalInsuranceHeld?: number; totalInsuranceDeducted?: number; totalExpenses: number; netProfit: number; categoryTotals: Record<string, number> } | null | undefined,
) {
  const win = window.open("", "_blank", "width=794,height=1123");
  if (!win) return;
  const qr = await generateReportQrDataUrl("monthly", month);
  win.document.write(buildMonthlyReportHtml(month, propertyName, report, financial, true, qr));
  win.document.close();
}

async function printYearlyReport(
  year: string,
  propertyName: string,
  yearly: { monthly: { month: string; revenue: number; expenses: number; netProfit: number }[]; totals: { revenue: number; expenses: number; netProfit: number } } | null | undefined,
) {
  if (!yearly) return;
  const win = window.open("", "_blank", "width=794,height=1123");
  if (!win) return;
  const qr = await generateReportQrDataUrl("yearly", year);
  win.document.write(buildYearlyReportHtml(year, propertyName, yearly, true, qr));
  win.document.close();
}

/* ── Shared Report HTML builders (for print + PDF export) ── */
const REPORT_CSS = `*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#111;direction:rtl;text-align:right;}.page{width:750px;padding:36px 40px;background:#fff;overflow:hidden;}.header{border-bottom:3px solid #b8860b;padding-bottom:18px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:center;flex-direction:row;direction:ltr;}.header-brand{flex-shrink:0;}.brand-name{font-size:24px;font-weight:800;color:#b8860b;direction:rtl;}.brand-sub{font-size:11px;color:#666;margin-top:3px;direction:rtl;}.header-center{flex:1;text-align:center;padding:0 16px;direction:rtl;}.report-title{font-size:17px;font-weight:700;text-align:center;}.report-sub{font-size:11px;color:#666;text-align:center;margin-top:3px;}.qr-block{flex-shrink:0;text-align:center;}.qr-img{width:80px;height:80px;display:block;image-rendering:crisp-edges;}.qr-caption{font-size:9px;color:#888;margin-top:3px;direction:rtl;}.section{margin-bottom:24px;}.section-title{font-size:15px;font-weight:700;color:#b8860b;border-right:3px solid #b8860b;padding-right:10px;margin-bottom:12px;}.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}.kpi-card{background:#faf9f6;border:1px solid #e8e2d0;border-radius:8px;padding:12px 14px;}.kpi-label{font-size:11px;color:#888;margin-bottom:4px;}.kpi-value{font-size:20px;font-weight:700;color:#111;}.kpi-note{font-size:10px;color:#aaa;margin-top:2px;}.kpi-green{border-color:#86efac!important;}.kpi-red{border-color:#fca5a5!important;}table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;word-wrap:break-word;}th{background:#b8860b;color:#fff;padding:8px 10px;text-align:right;}td{padding:8px 10px;border-bottom:1px solid #ede9dd;word-break:break-word;}tr:nth-child(even) td{background:#faf9f6;}tfoot td{font-weight:700;background:#fffbf0;border-top:2px solid #b8860b;}.footer{margin-top:40px;text-align:center;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:10px;}`;

function buildMonthlyReportHtml(
  month: string,
  propertyName: string,
  report: MonthReport | null | undefined,
  financial: { totalRevenue: number; totalInsuranceHeld?: number; totalInsuranceDeducted?: number; totalExpenses: number; netProfit: number; categoryTotals: Record<string, number> } | null | undefined,
  forPrint = false,
  qrDataUrl: string | null = null,
): string {
  const monthStr = new Date(month + "-15").toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
  const printDate = new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
  const catRows = financial && Object.keys(financial.categoryTotals).length > 0
    ? Object.entries(financial.categoryTotals).sort(([, a], [, b]) => b - a).map(([key, amt]) => {
        const cat = catMap[key] ?? { label: key, emoji: "✨" };
        const pct = financial.totalExpenses > 0 ? Math.round((amt / financial.totalExpenses) * 100) : 0;
        return `<tr><td>${cat.emoji} ${cat.label}</td><td>${formatAmount(amt)}</td><td>${pct}%</td></tr>`;
      }).join("") : "";
  const scriptTag = forPrint ? `<script>window.onload=function(){window.print();};<\/script>` : "";
  const qrHtml = qrDataUrl
    ? `<div class="qr-block"><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">مسح للتحقق</div></div>`
    : `<div class="qr-block" style="width:80px;"></div>`;
  const insuranceHeld = financial?.totalInsuranceHeld ?? 0;
  const insuranceDeducted = financial?.totalInsuranceDeducted ?? 0;
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>التقرير_الشهري_${monthStr}.pdf</title>
<style>${REPORT_CSS}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head>
<body><div class="page">
<div class="header">
<div class="header-brand"><div class="brand-name">حكاية أناقة</div><div class="brand-sub">منصة إدارة الشاليهات – القصيم</div></div>
<div class="header-center"><div class="report-title">التقرير الشهري – ${monthStr}</div><div class="report-sub">${propertyName} · ${printDate}</div></div>
${qrHtml}</div>
${financial ? `<div class="section"><div class="section-title">الملخص المالي (أرباح وخسائر)</div><div class="kpi-grid">
<div class="kpi-card kpi-green"><div class="kpi-label">إجمالي الإيرادات</div><div class="kpi-value">${formatAmount(financial.totalRevenue)}</div><div class="kpi-note">عربون + محصّل + تلفيات</div></div>
<div class="kpi-card kpi-red"><div class="kpi-label">إجمالي المصروفات</div><div class="kpi-value">${formatAmount(financial.totalExpenses)}</div><div class="kpi-note">مصروفات + رواتب</div></div>
<div class="kpi-card ${financial.netProfit >= 0 ? "kpi-green" : "kpi-red"}"><div class="kpi-label">صافي الربح</div><div class="kpi-value">${formatAmount(financial.netProfit)}</div><div class="kpi-note">الإيرادات - المصروفات</div></div>
</div>${insuranceDeducted > 0 ? `<div style="margin-top:8px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;font-weight:700;color:#b91c1c;">✂️ إيرادات تلفيات (محوّلة من التأمين)</span><span style="font-size:16px;font-weight:700;color:#b91c1c;">${formatAmount(insuranceDeducted)}</span></div>` : ""}${insuranceHeld > 0 ? `<div style="margin-top:8px;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;"><span style="font-size:12px;font-weight:700;color:#c2410c;">🔒 تأمينات محتجزة (غير محسوبة في الأرباح)</span><span style="font-size:16px;font-weight:700;color:#c2410c;">${formatAmount(insuranceHeld)}</span></div>` : ""}</div>${catRows ? `<div class="section"><div class="section-title">توزيع المصروفات</div><table><thead><tr><th>الفئة</th><th>المبلغ (ر.س)</th><th>النسبة</th></tr></thead><tbody>${catRows}</tbody></table></div>` : ""}` : ""}
${report ? `<div class="section"><div class="section-title">إحصائيات الحجوزات</div><div class="kpi-grid">
<div class="kpi-card"><div class="kpi-label">إجمالي الحجوزات</div><div class="kpi-value">${report.totalBookings}</div></div>
<div class="kpi-card"><div class="kpi-label">نسبة الإشغال</div><div class="kpi-value">${report.occupancyRate}%</div></div>
<div class="kpi-card"><div class="kpi-label">أيام مشغولة</div><div class="kpi-value">${report.totalDays} / ${report.daysInMonth}</div></div>
</div></div>` : ""}
<div class="footer">تم إصدار هذا التقرير عبر منصة حكاية أناقة · ${new Date().getFullYear()}</div>
</div>${scriptTag}</body></html>`;
}

function buildYearlyReportHtml(
  year: string,
  propertyName: string,
  yearly: { monthly: { month: string; revenue: number; expenses: number; netProfit: number }[]; totals: { revenue: number; expenses: number; netProfit: number } },
  forPrint = false,
  qrDataUrl: string | null = null,
): string {
  const printDate = new Date().toLocaleDateString("ar-SA", { day: "numeric", month: "long", year: "numeric" });
  const rows = yearly.monthly.map(m => {
    const label = new Date(m.month + "-15").toLocaleDateString("ar-SA", { month: "long" });
    const cls = m.netProfit >= 0 ? "color:#16a34a" : "color:#dc2626";
    return `<tr><td>${label}</td><td>${formatAmount(m.revenue)}</td><td>${formatAmount(m.expenses)}</td><td style="${cls}">${formatAmount(m.netProfit)}</td></tr>`;
  }).join("");
  const scriptTag = forPrint ? `<script>window.onload=function(){window.print();};<\/script>` : "";
  const qrHtml = qrDataUrl
    ? `<div class="qr-block"><img src="${qrDataUrl}" class="qr-img" /><div class="qr-caption">مسح للتحقق</div></div>`
    : `<div class="qr-block" style="width:80px;"></div>`;
  return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"/>
<title>التقرير_السنوي_${year}.pdf</title>
<style>${REPORT_CSS}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}</style></head>
<body><div class="page">
<div class="header">
<div class="header-brand"><div class="brand-name">حكاية أناقة</div><div class="brand-sub">منصة إدارة الشاليهات – القصيم</div></div>
<div class="header-center"><div class="report-title">التقرير السنوي – ${year}</div><div class="report-sub">${propertyName} · ${printDate}</div></div>
${qrHtml}</div>
<div class="kpi-grid" style="margin-bottom:24px">
<div class="kpi-card kpi-green"><div class="kpi-label">إجمالي الإيرادات السنوية</div><div class="kpi-value">${formatAmount(yearly.totals.revenue)}</div></div>
<div class="kpi-card kpi-red"><div class="kpi-label">إجمالي المصروفات السنوية</div><div class="kpi-value">${formatAmount(yearly.totals.expenses)}</div></div>
<div class="kpi-card ${yearly.totals.netProfit >= 0 ? "kpi-green" : "kpi-red"}"><div class="kpi-label">صافي الربح السنوي</div><div class="kpi-value" style="${yearly.totals.netProfit >= 0 ? "color:#16a34a" : "color:#dc2626"}">${formatAmount(yearly.totals.netProfit)}</div></div>
</div>
<table><thead><tr><th>الشهر</th><th>الإيرادات (ر.س)</th><th>المصروفات (ر.س)</th><th>صافي الربح (ر.س)</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td>الإجمالي السنوي</td><td>${formatAmount(yearly.totals.revenue)}</td><td>${formatAmount(yearly.totals.expenses)}</td><td style="${yearly.totals.netProfit >= 0 ? "color:#16a34a" : "color:#dc2626"}">${formatAmount(yearly.totals.netProfit)}</td></tr></tfoot>
</table>
<div class="footer">تم إصدار هذا التقرير عبر منصة حكاية أناقة · ${new Date().getFullYear()}</div>
</div>${scriptTag}</body></html>`;
}

/* ── HTML → PDF blob (html2canvas + jsPDF) ── */
async function htmlToPdfBlob(html: string, fileName: string): Promise<{ blob: Blob; fileName: string }> {
  // Use DOMParser to properly extract styles and body content from the full HTML doc
  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(html, "text/html");
  const styles = Array.from(parsedDoc.querySelectorAll("style")).map((s) => s.textContent ?? "").join("\n");
  const bodyContent = parsedDoc.body.innerHTML;

  // A4 page: 210mm × 297mm. Content width = 180mm (with 15mm side margins).
  // At 96dpi, 1mm ≈ 3.7795px → content canvas width = 750px → 198.4mm → fits in 180mm after margins.
  const CONTENT_PX = 750; // must match .page width in REPORT_CSS

  // Wrapper: position in viewport so html2canvas can capture it.
  // visibility:hidden and opacity:0 cause html2canvas to skip rendering,
  // so we position the element above the viewport fold via negative top margin
  // and use clip:rect(0,0,0,0) combined with overflow:hidden on html.
  // Simplest reliable approach: fixed top:0 left:0, above content (z-index:99999),
  // pointer-events:none. The element is briefly visible during ~500ms generation
  // but the loading state in the UI makes this imperceptible.
  const wrapper = document.createElement("div");
  wrapper.dir = "rtl";
  wrapper.style.cssText = [
    "position:fixed",
    "top:0",
    "left:0",
    `width:${CONTENT_PX}px`,
    "background:#fff",
    "direction:rtl",
    "pointer-events:none",
    "z-index:99999",
    // Clip so only the area behind the page header is used (no flash effect)
    "overflow:hidden",
  ].join(";");

  const styleEl = document.createElement("style");
  styleEl.textContent = styles;
  wrapper.appendChild(styleEl);

  const contentEl = document.createElement("div");
  contentEl.innerHTML = bodyContent;
  wrapper.appendChild(contentEl);

  document.body.appendChild(wrapper);

  try {
    // Wait for CSS to apply and fonts to render
    await new Promise<void>((resolve) => setTimeout(resolve, 500));

    const pageEl = wrapper.querySelector<HTMLElement>(".page") ?? wrapper;

    // Fix: pass scrollX=0/scrollY=0 so position:fixed elements aren't shifted by page scroll.
    // windowWidth matches the fixed width so responsive breakpoints don't misfire.
    const canvas = await html2canvas(pageEl, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      width: CONTENT_PX,
      windowWidth: CONTENT_PX,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });

    // Build an A4 PDF (210mm × 297mm) with 15mm margins.
    // jsPDF unit 'mm': page width 210, content area 180mm (210 - 2×15).
    const A4_W_MM = 210;
    const MARGIN_MM = 15;
    const contentWidthMm = A4_W_MM - MARGIN_MM * 2; // 180mm
    const contentHeightMm = (canvas.height / canvas.width) * contentWidthMm;
    const pageHeightMm = contentHeightMm + MARGIN_MM * 2;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [A4_W_MM, Math.max(pageHeightMm, 297)], // at least A4 height
    });

    // Draw white background first (ensures no transparency artifacts)
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, A4_W_MM, Math.max(pageHeightMm, 297), "F");

    pdf.addImage(
      canvas.toDataURL("image/jpeg", 0.95),
      "JPEG",
      MARGIN_MM,  // x — 15mm from left
      MARGIN_MM,  // y — 15mm from top
      contentWidthMm,
      contentHeightMm,
    );

    return { blob: pdf.output("blob"), fileName };
  } finally {
    try { document.body.removeChild(wrapper); } catch { /* ignore */ }
  }
}

/* ── Generate PDF → upload to storage → return public URL ── */
async function generateAndUploadReportPdf(
  type: "monthly" | "yearly",
  params: {
    month?: string;
    year?: string;
    propertyName: string;
    report?: MonthReport | null;
    financial?: { totalRevenue: number; totalInsuranceHeld?: number; totalInsuranceDeducted?: number; totalExpenses: number; netProfit: number; categoryTotals: Record<string, number> } | null;
    yearly?: { monthly: { month: string; revenue: number; expenses: number; netProfit: number }[]; totals: { revenue: number; expenses: number; netProfit: number } } | null;
  }
): Promise<string | null> {
  let html: string;
  let fileName: string;

  if (type === "monthly") {
    fileName = `Monthly_Report_${params.month ?? "report"}.pdf`;
    const qr = await generateReportQrDataUrl("monthly", params.month!);
    html = buildMonthlyReportHtml(params.month!, params.propertyName, params.report, params.financial, false, qr);
  } else {
    fileName = `Annual_Report_${params.year ?? new Date().getFullYear()}.pdf`;
    const qr = await generateReportQrDataUrl("yearly", params.year!);
    html = buildYearlyReportHtml(params.year!, params.propertyName, params.yearly!, false, qr);
  }

  const { blob } = await htmlToPdfBlob(html, fileName);
  const file = new File([blob], fileName, { type: "application/pdf" });
  return uploadFile(file);
}

function ReportsTab() {
  const { isReadOnly, onBlockedEdit } = useReadOnly();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentYear = new Date().getFullYear().toString();

  const [viewMode, setViewMode] = useState<"monthly" | "yearly">("monthly");
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("all");
  const [sharePhone, setSharePhone] = useState(() => localStorage.getItem("reportSharePhone") ?? "");
  const [shareEmail, setShareEmail] = useState(() => localStorage.getItem("reportShareEmail") ?? "");
  const [showShare, setShowShare] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [archiveSavedId, setArchiveSavedId] = useState<number | null>(null);
  const qc = useQueryClient();

  useEffect(() => { setPdfUrl(null); setArchiveSavedId(null); }, [viewMode, selectedMonth, selectedYear, selectedSubmissionId]);

  const { data: mySubmissions = [] } = useQuery<any[]>({
    queryKey: ["my-submissions-for-report"],
    queryFn: async () => {
      const r = await apiFetch("/submissions/mine");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: report, isLoading } = useQuery<MonthReport>({
    queryKey: ["owner", "reports", selectedMonth, selectedSubmissionId],
    queryFn: async () => {
      const params = new URLSearchParams({ month: selectedMonth });
      if (selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      const r = await apiFetch(`/owner/reports?${params}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    enabled: viewMode === "monthly",
  });

  const { data: subscription } = useQuery({
    queryKey: ["owner", "subscription"],
    queryFn: async () => {
      const r = await apiFetch("/owner/subscription");
      if (!r.ok) return null;
      return r.json();
    },
  });

  const { data: financial } = useQuery<{
    month: string;
    totalRevenue: number;
    totalInsuranceHeld: number;
    totalInsuranceDeducted: number;
    totalExpenses: number;
    netProfit: number;
    categoryTotals: Record<string, number>;
    trend: { month: string; revenue: number; expenses: number }[];
  }>({
    queryKey: ["owner", "financial-summary", selectedMonth, selectedSubmissionId],
    queryFn: async () => {
      const params = new URLSearchParams({ month: selectedMonth });
      if (selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      const r = await apiFetch(`/owner/financial-summary?${params}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: viewMode === "monthly",
  });

  const { data: yearly, isLoading: yearlyLoading } = useQuery<{
    year: string;
    monthly: { month: string; revenue: number; expenses: number; netProfit: number }[];
    totals: { revenue: number; expenses: number; netProfit: number };
  }>({
    queryKey: ["owner", "yearly-summary", selectedYear, selectedSubmissionId],
    queryFn: async () => {
      const params = new URLSearchParams({ year: selectedYear });
      if (selectedSubmissionId !== "all") params.set("submissionId", selectedSubmissionId);
      const r = await apiFetch(`/owner/yearly-summary?${params}`);
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    enabled: viewMode === "yearly",
  });

  const { data: archive = [] } = useQuery<any[]>({
    queryKey: ["owner", "reports-archive"],
    queryFn: async () => {
      const r = await apiFetch("/owner/reports/archive");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: showArchive,
  });

  const archiveMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await apiFetch("/owner/reports/archive", { method: "POST", body: JSON.stringify(payload) });
      if (!r.ok) throw new Error("فشل الحفظ");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "reports-archive"] }),
  });

  const deleteArchiveMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await apiFetch(`/owner/reports/archive/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "reports-archive"] }),
  });

  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const val = d.toISOString().slice(0, 7);
      const label = d.toLocaleDateString("ar-SA", { year: "numeric", month: "long" });
      opts.push({ val, label });
    }
    return opts;
  }, []);

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur, cur - 1, cur - 2].map((y) => ({ val: String(y), label: String(y) }));
  }, []);

  const slotLabels: Record<string, { icon: ReactElement; label: string }> = {
    morning:     { icon: <Sunrise className="w-4 h-4" />,  label: "صباحي" },
    evening:     { icon: <Moon className="w-4 h-4" />,     label: "مسائي" },
    full_day:    { icon: <Sun className="w-4 h-4" />,      label: "يوم كامل" },
    unspecified: { icon: <Clock className="w-4 h-4" />,    label: "غير محدد" },
  };

  const selectedPropertyName = selectedSubmissionId === "all"
    ? "كل العقارات"
    : mySubmissions.find((s: any) => String(s.id) === selectedSubmissionId)?.nameAr ?? `شاليه #${selectedSubmissionId}`;

  const handleShareWhatsApp = useCallback(async () => {
    const phone = sharePhone.replace(/\D/g, "");

    // ── Build report metadata ──────────────────────────────────────────────
    let titleText = "";
    let bodyText = "";
    let fileName = "";
    let htmlContent = "";

    if (viewMode === "monthly" && report) {
      const monthLabel = monthOptions.find(o => o.val === selectedMonth)?.label ?? selectedMonth;
      titleText = `تقرير ${monthLabel} – ${selectedPropertyName}`;
      bodyText =
        `📊 تقرير شهر ${monthLabel}\n` +
        `🏠 العقار: ${selectedPropertyName}\n` +
        `📅 الحجوزات: ${report.totalBookings} · الإشغال: ${report.occupancyRate}%\n` +
        (financial ? `💰 صافي الربح: ${formatAmount(financial.netProfit)}\n` : "") +
        `✨ منصة حكاية أناقة – شاليهات القصيم`;
      fileName = `Monthly_Report_${selectedMonth}.pdf`;
    } else if (viewMode === "yearly" && yearly) {
      titleText = `التقرير السنوي ${selectedYear} – ${selectedPropertyName}`;
      bodyText =
        `📊 التقرير السنوي ${selectedYear}\n` +
        `🏠 العقار: ${selectedPropertyName}\n` +
        `💚 الإيرادات: ${formatAmount(yearly.totals.revenue)}\n` +
        `🔴 المصروفات: ${formatAmount(yearly.totals.expenses)}\n` +
        `⭐ صافي الربح: ${formatAmount(yearly.totals.netProfit)}\n` +
        `✨ منصة حكاية أناقة – شاليهات القصيم`;
      fileName = `Annual_Report_${selectedYear}.pdf`;
    } else return;

    // ── Fast path: desktop + cached URL (no need to regenerate) ───────────
    const canShareFiles = typeof navigator.share === "function" && typeof navigator.canShare === "function";
    if (!canShareFiles && pdfUrl) {
      const text = bodyText + `\n📎 التقرير (PDF): ${pdfUrl}`;
      const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waLink, "_blank");
      return;
    }

    setPdfLoading(true);
    try {
      // ── Generate PDF blob ──────────────────────────────────────────────
      const qr = viewMode === "monthly"
        ? await generateReportQrDataUrl("monthly", selectedMonth)
        : await generateReportQrDataUrl("yearly", selectedYear);

      if (viewMode === "monthly") {
        htmlContent = buildMonthlyReportHtml(selectedMonth, selectedPropertyName, report, financial, false, qr);
      } else {
        htmlContent = buildYearlyReportHtml(selectedYear, selectedPropertyName, yearly!, false, qr);
      }

      const { blob } = await htmlToPdfBlob(htmlContent, fileName);
      const pdfFile = new File([blob], fileName, { type: "application/pdf" });

      // ── Try Web Share API (mobile) — sends ACTUAL FILE to WhatsApp ─────
      // On mobile the OS share sheet appears; user picks WhatsApp → PDF attached.
      if (canShareFiles && navigator.canShare({ files: [pdfFile] })) {
        try {
          await navigator.share({ files: [pdfFile], title: titleText, text: bodyText });
          return; // File shared successfully via native share sheet
        } catch (shareErr: unknown) {
          if ((shareErr as Error)?.name === "AbortError") return; // User cancelled
          // Other error — fall through to wa.me fallback
        }
      }

      // ── Desktop fallback: upload PDF → wa.me link ──────────────────────
      // wa.me only supports text; we include a download link as the best alternative.
      let url: string | null = pdfUrl;
      if (!url) {
        url = await uploadFile(pdfFile);
        if (url) setPdfUrl(url);
      }
      const text = bodyText + (url ? `\n📎 التقرير (PDF): ${url}` : "");
      const waLink = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(waLink, "_blank");
    } catch (e) {
      console.error("Share failed:", e);
      alert("تعذّر مشاركة التقرير، يرجى المحاولة مرة أخرى.");
    } finally {
      setPdfLoading(false);
    }
  }, [viewMode, selectedMonth, selectedYear, selectedPropertyName, report, financial, yearly, sharePhone, pdfUrl, monthOptions]);

  const handleShareEmail = useCallback(async () => {
    if (!shareEmail) { alert("يرجى إدخال البريد الإلكتروني في إعدادات المشاركة"); return; }
    let url = pdfUrl;
    if (!url) {
      setPdfLoading(true);
      try {
        if (viewMode === "monthly") {
          url = await generateAndUploadReportPdf("monthly", { month: selectedMonth, propertyName: selectedPropertyName, report, financial });
        } else if (viewMode === "yearly" && yearly) {
          url = await generateAndUploadReportPdf("yearly", { year: selectedYear, propertyName: selectedPropertyName, yearly });
        }
        if (url) setPdfUrl(url);
      } catch (e) { console.error(e); } finally { setPdfLoading(false); }
    }
    let subject = "";
    let body = "";
    if (viewMode === "monthly" && report) {
      subject = `تقرير شهري – ${monthOptions.find(o => o.val === selectedMonth)?.label ?? selectedMonth}`;
      body = `${selectedPropertyName}\n\nالحجوزات: ${report.totalBookings}\nالإشغال: ${report.occupancyRate}%` +
        (financial ? `\nصافي الربح: ${formatAmount(financial.netProfit)}` : "") +
        (url ? `\n\nرابط التقرير PDF:\n${url}` : "") +
        `\n\nحكاية أناقة – شاليهات القصيم`;
    } else if (viewMode === "yearly" && yearly) {
      subject = `التقرير السنوي – ${selectedYear}`;
      body = `${selectedPropertyName}\n\nإيرادات: ${formatAmount(yearly.totals.revenue)}\nمصروفات: ${formatAmount(yearly.totals.expenses)}\nصافي: ${formatAmount(yearly.totals.netProfit)}` +
        (url ? `\n\nرابط التقرير PDF:\n${url}` : "") +
        `\n\nحكاية أناقة – شاليهات القصيم`;
    }
    window.open(`mailto:${shareEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  }, [viewMode, selectedMonth, selectedYear, selectedPropertyName, report, financial, yearly, shareEmail, pdfUrl, monthOptions]);

  const handleSaveToArchive = useCallback(async () => {
    setArchiveSaving(true);
    try {
      let url = pdfUrl;
      if (!url) {
        if (viewMode === "monthly") {
          url = await generateAndUploadReportPdf("monthly", { month: selectedMonth, propertyName: selectedPropertyName, report, financial });
        } else if (viewMode === "yearly" && yearly) {
          url = await generateAndUploadReportPdf("yearly", { year: selectedYear, propertyName: selectedPropertyName, yearly });
        }
        if (url) setPdfUrl(url);
      }
      const basePayload = {
        submissionId: selectedSubmissionId !== "all" ? Number(selectedSubmissionId) : undefined,
        propertyName: selectedPropertyName,
        pdfUrl: url ?? undefined,
      };
      const payload = viewMode === "monthly"
        ? { ...basePayload, reportType: "monthly", reportPeriod: selectedMonth, data: { report, financial } }
        : { ...basePayload, reportType: "yearly", reportPeriod: selectedYear, data: { yearly } };
      const result = await new Promise<any>((resolve, reject) => {
        archiveMutation.mutate(payload, { onSuccess: resolve, onError: reject });
      });
      setArchiveSavedId(result?.id ?? null);
      setShowArchive(true);
    } catch (e) {
      console.error("Archive save failed:", e);
      alert("تعذّر حفظ التقرير في الأرشيف");
    } finally {
      setArchiveSaving(false);
    }
  }, [viewMode, selectedMonth, selectedYear, selectedSubmissionId, selectedPropertyName, report, financial, yearly, pdfUrl, archiveMutation]);

  const planLabels: Record<string, string> = {
    trial: "تجريبي (30 يوم)",
    monthly: "شهري",
    yearly: "سنوي",
  };
  const statusLabels: Record<string, { label: string; className: string }> = {
    active:   { label: "نشط", className: "bg-green-100 text-green-700" },
    expired:  { label: "منتهي", className: "bg-red-100 text-red-700" },
    pending:  { label: "قيد التفعيل", className: "bg-amber-100 text-amber-700" },
  };

  return (
    <div className="space-y-6">

      {/* ── View Mode Toggle ── */}
      <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-1 w-fit">
        {(["monthly", "yearly"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setViewMode(m)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
              viewMode === m ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m === "monthly" ? "شهري" : "سنوي"}
          </button>
        ))}
      </div>

      {/* Subscription Card */}
      {/* Subscription card moved to profile header area — not shown in Reports */}

      {/* ── Filters ── */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          فلاتر التقرير
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground font-medium">العقار</label>
            <Select value={selectedSubmissionId} onValueChange={setSelectedSubmissionId}>
              <SelectTrigger className="h-10"><SelectValue placeholder="كل العقارات" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العقارات</SelectItem>
                {mySubmissions.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.nameAr ?? `شاليه #${s.id}`}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {viewMode === "monthly" ? (
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">الشهر</label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {monthOptions.map((o) => (<SelectItem key={o.val} value={o.val}>{o.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground font-medium">السنة</label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {yearOptions.map((o) => (<SelectItem key={o.val} value={o.val}>{o.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        {selectedSubmissionId !== "all" && (
          <p className="text-xs text-primary font-medium flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            يعرض بيانات: {selectedPropertyName}
          </p>
        )}
      </div>

      {/* ── YEARLY VIEW ── */}
      {viewMode === "yearly" && (
        <>
          {yearlyLoading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : yearly ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "إجمالي الإيرادات", value: formatAmount(yearly.totals.revenue), icon: <TrendingUp className="w-5 h-5" />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                  { label: "إجمالي المصروفات", value: formatAmount(yearly.totals.expenses), icon: <TrendingDown className="w-5 h-5" />, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
                  { label: "صافي الربح السنوي", value: formatAmount(yearly.totals.netProfit), icon: <DollarSign className="w-5 h-5" />, color: yearly.totals.netProfit >= 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-700" },
                ].map((s) => (
                  <div key={s.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.color}`}>{s.icon}</div>
                    <p className="text-xl font-bold text-foreground leading-none">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>

              {yearly.monthly.some((m) => m.revenue > 0 || m.expenses > 0) && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />
                    الإيرادات والمصروفات لعام {selectedYear}
                  </h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={yearly.monthly.map((m) => ({
                      name: new Date(m.month + "-15").toLocaleDateString("ar-SA", { month: "short" }),
                      الإيرادات: m.revenue,
                      المصروفات: m.expenses,
                    }))} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} formatter={(v: number) => [formatAmount(v)]} />
                      <Legend wrapperStyle={{ fontSize: 12, direction: "rtl" }} />
                      <Bar dataKey="الإيرادات" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="المصروفات" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-bold text-foreground text-sm mb-4">تفصيل شهري لعام {selectedYear}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-right py-2 font-medium text-muted-foreground">الشهر</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">الإيرادات</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">المصروفات</th>
                        <th className="text-right py-2 font-medium text-muted-foreground">صافي الربح</th>
                      </tr>
                    </thead>
                    <tbody>
                      {yearly.monthly.map((m) => (
                        <tr key={m.month} className="border-b border-border/50">
                          <td className="py-2 text-muted-foreground">{new Date(m.month + "-15").toLocaleDateString("ar-SA", { month: "long" })}</td>
                          <td className="py-2 font-medium text-green-600">{formatAmount(m.revenue)}</td>
                          <td className="py-2 font-medium text-red-600">{formatAmount(m.expenses)}</td>
                          <td className={`py-2 font-bold ${m.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>{formatAmount(m.netProfit)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border">
                        <td className="py-2 font-bold">الإجمالي</td>
                        <td className="py-2 font-bold text-green-600">{formatAmount(yearly.totals.revenue)}</td>
                        <td className="py-2 font-bold text-red-600">{formatAmount(yearly.totals.expenses)}</td>
                        <td className={`py-2 font-bold ${yearly.totals.netProfit >= 0 ? "text-primary" : "text-destructive"}`}>{formatAmount(yearly.totals.netProfit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => printYearlyReport(selectedYear, selectedPropertyName, yearly)} className="gap-2">
                  <FileText className="w-4 h-4" />طباعة التقرير السنوي
                </Button>
                <Button variant="outline" size="sm" onClick={handleShareWhatsApp} disabled={pdfLoading} className="gap-2">
                  {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  {pdfLoading ? "جاري إنشاء PDF…" : "مشاركة PDF واتساب"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleShareEmail} disabled={pdfLoading} className="gap-2">
                  {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  بريد
                </Button>
                <Button
                  variant={archiveSavedId ? "default" : "outline"}
                  size="sm"
                  onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } handleSaveToArchive(); }}
                  disabled={archiveSaving || archiveMutation.isPending || isReadOnly}
                  className="gap-2"
                >
                  {archiveSaving
                    ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الحفظ…</>
                    : archiveSavedId
                    ? <><Archive className="w-4 h-4" />تم الحفظ ✓</>
                    : <><Archive className="w-4 h-4" />حفظ في الأرشيف</>}
                </Button>
              </div>
            </>
          ) : (
            <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
              <BarChart2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">لا توجد بيانات لهذه السنة</p>
            </div>
          )}
        </>
      )}

      {/* ── MONTHLY VIEW ── */}
      {viewMode === "monthly" && (
        <>
          {financial && (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "إجمالي الإيرادات", value: formatAmount(financial.totalRevenue), icon: <TrendingUp className="w-5 h-5" />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", note: "عربون + مبالغ محصّلة" },
                  { label: "إجمالي المصروفات", value: formatAmount(financial.totalExpenses), icon: <TrendingDown className="w-5 h-5" />, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", note: "مصروفات + رواتب" },
                  { label: "صافي الربح", value: formatAmount(financial.netProfit), icon: <DollarSign className="w-5 h-5" />, color: financial.netProfit >= 0 ? "bg-primary/10 text-primary" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", note: "الإيرادات - المصروفات" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
                    <p className="text-xl font-bold text-foreground leading-none">{stat.value}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
                    <p className="text-[10px] text-muted-foreground/60">{stat.note}</p>
                  </div>
                ))}
              </div>

              {/* Insurance damage deductions — converted to revenue under تلفيات */}
              {financial.totalInsuranceDeducted > 0 && (
                <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-2xl px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <span className="text-base">✂️</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-red-700 dark:text-red-400">إيرادات تلفيات</p>
                      <p className="text-[10px] text-red-600/70 dark:text-red-500/70">مخصومة من التأمين · محسوبة في الإيرادات</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-red-700 dark:text-red-400">{formatAmount(financial.totalInsuranceDeducted)}</p>
                </div>
              )}

              {/* Insurance held — shown separately since it's refundable and NOT counted in profit */}
              {financial.totalInsuranceHeld > 0 && (
                <div className="flex items-center justify-between bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-2xl px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                      <span className="text-base">🔒</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">تأمينات محتجزة</p>
                      <p className="text-[10px] text-orange-600/70 dark:text-orange-500/70">غير محسوبة في الأرباح · قابلة للإعادة</p>
                    </div>
                  </div>
                  <p className="text-lg font-bold text-orange-700 dark:text-orange-400">{formatAmount(financial.totalInsuranceHeld)}</p>
                </div>
              )}

              {Object.keys(financial.categoryTotals).length > 0 && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />توزيع المصروفات
                  </h3>
                  <div className="space-y-2">
                    {Object.entries(financial.categoryTotals).sort(([, a], [, b]) => b - a).map(([key, amount]) => {
                      const cat = catMap[key] ?? { label: key, emoji: "✨", color: "bg-slate-100 text-slate-700" };
                      const pct = financial.totalExpenses > 0 ? Math.round((amount / financial.totalExpenses) * 100) : 0;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between text-sm mb-1">
                            <span className="flex items-center gap-1.5 text-muted-foreground"><span>{cat.emoji}</span>{cat.label}</span>
                            <span className="font-semibold">{formatAmount(amount)} <span className="text-xs text-muted-foreground">({pct}%)</span></span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-1.5">
                            <div className="h-1.5 rounded-full bg-destructive/70 transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {financial.trend.some((t) => t.revenue > 0 || t.expenses > 0) && (
                <div className="bg-card border border-border rounded-2xl p-5">
                  <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-primary" />مقارنة الإيرادات والمصروفات (آخر 6 أشهر)
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={financial.trend.map((t) => ({
                      name: new Date(t.month + "-15").toLocaleDateString("ar-SA", { month: "short" }),
                      الإيرادات: t.revenue,
                      المصروفات: t.expenses,
                    }))} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} formatter={(value: number) => [formatAmount(value)]} />
                      <Legend wrapperStyle={{ fontSize: 12, direction: "rtl" }} />
                      <Bar dataKey="الإيرادات" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="المصروفات" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}

          {isLoading ? (
            <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          ) : !report ? (
            <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
              <BarChart2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-muted-foreground">لا توجد بيانات حجوزات لهذا الشهر</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: "إجمالي الحجوزات", value: report.totalBookings, icon: <BookOpen className="w-5 h-5" />, color: "bg-primary/10 text-primary" },
                  { label: "نسبة الإشغال", value: `${report.occupancyRate}%`, icon: <TrendingUp className="w-5 h-5" />, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                  { label: "عبر المنصة", value: report.platformBookings, icon: <Globe className="w-5 h-5" />, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
                  { label: "من خارج المنصة", value: report.externalBookings, icon: <Phone className="w-5 h-5" />, color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
                  </div>
                ))}
              </div>

              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-foreground text-sm">نسبة الإشغال — {monthOptions.find((o) => o.val === selectedMonth)?.label}</h3>
                  <span className="text-2xl font-bold text-primary">{report.occupancyRate}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div className="bg-primary h-3 rounded-full transition-all duration-500" style={{ width: `${report.occupancyRate}%` }} />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{report.totalDays} يوم محجوز من أصل {report.daysInMonth} يوم</p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-bold text-foreground mb-4 text-sm">توزيع الفترات الزمنية</h3>
                <div className="space-y-3">
                  {(["morning", "evening", "full_day"] as const).map((key) => {
                    const count = report.slotStats[key];
                    const total = report.totalBookings || 1;
                    const pct = Math.round((count / total) * 100);
                    const { icon, label } = slotLabels[key];
                    const isTop = key === report.topSlot;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-2 text-muted-foreground">
                            {icon} {label}
                            {isTop && count > 0 && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-semibold">الأعلى</span>}
                          </span>
                          <span className="font-semibold">{count} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className={`h-2 rounded-full transition-all duration-500 ${isTop && count > 0 ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => printMonthlyReport(selectedMonth, selectedPropertyName, report, financial)} className="gap-2">
                  <FileText className="w-4 h-4" />طباعة التقرير
                </Button>
                <Button variant="outline" size="sm" onClick={handleShareWhatsApp} disabled={pdfLoading} className="gap-2">
                  {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  {pdfLoading ? "جاري إنشاء PDF…" : "مشاركة PDF واتساب"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleShareEmail} disabled={pdfLoading} className="gap-2">
                  {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  بريد
                </Button>
                <Button
                  variant={archiveSavedId ? "default" : "outline"}
                  size="sm"
                  onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } handleSaveToArchive(); }}
                  disabled={archiveSaving || archiveMutation.isPending || isReadOnly}
                  className="gap-2"
                >
                  {archiveSaving
                    ? <><Loader2 className="w-4 h-4 animate-spin" />جاري الحفظ…</>
                    : archiveSavedId
                    ? <><Archive className="w-4 h-4" />تم الحفظ ✓</>
                    : <><Archive className="w-4 h-4" />حفظ في الأرشيف</>}
                </Button>
              </div>
            </>
          )}
        </>
      )}

      {/* ── Sharing Settings ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <button
          onClick={() => setShowShare((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-bold text-foreground"
        >
          <span className="flex items-center gap-2"><Settings className="w-4 h-4 text-primary" />إعدادات المشاركة</span>
          {showShare ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showShare && (
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">رقم واتساب (للمشاركة المباشرة)</label>
              <Input
                dir="ltr"
                placeholder="+966XXXXXXXXX"
                value={sharePhone}
                onChange={(e) => { setSharePhone(e.target.value); localStorage.setItem("reportSharePhone", e.target.value); }}
                className="h-10"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground font-medium">البريد الإلكتروني</label>
              <Input
                dir="ltr"
                type="email"
                placeholder="example@email.com"
                value={shareEmail}
                onChange={(e) => { setShareEmail(e.target.value); localStorage.setItem("reportShareEmail", e.target.value); }}
                className="h-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">تُحفظ هذه الإعدادات تلقائياً على هذا الجهاز</p>
          </div>
        )}
      </div>

      {/* ── Archive ── */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <button
          onClick={() => setShowArchive((v) => !v)}
          className="w-full flex items-center justify-between text-sm font-bold text-foreground"
        >
          <span className="flex items-center gap-2"><Archive className="w-4 h-4 text-primary" />أرشيف التقارير</span>
          {showArchive ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showArchive && (
          <div className="mt-4">
            {archive.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">لا توجد تقارير محفوظة بعد</p>
            ) : (
              <div className="space-y-2">
                {archive.map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between p-3 bg-muted/40 rounded-xl gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        {a.reportType === "yearly" ? "تقرير سنوي" : "تقرير شهري"} – {a.reportPeriod}
                      </p>
                      <p className="text-xs text-muted-foreground">{a.propertyName} · {new Date(a.createdAt).toLocaleDateString("ar-SA")}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {a.pdfUrl ? (
                        <a
                          href={a.pdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="عرض / تحميل PDF"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors border border-amber-200 dark:border-amber-800"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          عرض PDF
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground/50 px-1">بدون PDF</span>
                      )}
                      <button
                        onClick={() => { if (isReadOnly) { onBlockedEdit(); return; } if (confirm("حذف هذا التقرير من الأرشيف؟")) deleteArchiveMutation.mutate(a.id); }}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        title="حذف من الأرشيف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

    </div>
  );
}

/* ── Reviews Tab ─────────────────────────────── */
interface OwnerChalet { id: number; nameAr: string; photos: string[]; waReviewTemplate: string | null }

const DEFAULT_REVIEW_TEMPLATE = "أهلاً {guest_name}، يسعدنا تقييمك لتجربتك في {chalet_name} 🌟\nاضغط هنا لتقييمك: {link}";

interface OwnerReviewRow {
  id: number;
  chaletId: number;
  chaletName: string | null;
  rating: number;
  comment: string | null;
  photoUrls: string[];
  isVerified: boolean;
  isHidden: boolean;
  ownerReply: string | null;
  ownerReplyAt: string | null;
  reportedBy: string | null;
  reportedAt: string | null;
  createdAt: string;
}

function ReviewsTab() {
  const qc = useQueryClient();
  const [selectedChaletId, setSelectedChaletId] = useState<number | null>(null);
  const [generatedLinks, setGeneratedLinks] = useState<Record<number, string>>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [templateDraft, setTemplateDraft] = useState<Record<number, string>>({});
  const [templateSaved, setTemplateSaved] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  const [replyingId, setReplyingId] = useState<number | null>(null);
  const [reportConfirmId, setReportConfirmId] = useState<number | null>(null);
  const [reportReasonDraft, setReportReasonDraft] = useState("");

  interface OwnerNotifRow {
    id: number; type: string; chaletId: number | null; reviewId: number | null;
    message: string; isRead: boolean; createdAt: string;
  }
  const { data: notifications = [] } = useQuery<OwnerNotifRow[]>({
    queryKey: ["owner", "notifications"],
    queryFn: async () => {
      const r = await apiFetch("/owner/notifications");
      if (!r.ok) return [];
      return r.json();
    },
    refetchInterval: 30_000,
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiFetch("/owner/notifications/read-all", { method: "PATCH" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "notifications"] });
      qc.invalidateQueries({ queryKey: ["owner", "notifications-summary"] });
    },
  });

  const { data: siteSettings = {} } = useQuery<Record<string, string>>({
    queryKey: ["siteSettings"],
    queryFn: async () => {
      const r = await fetch("/api/page-content");
      if (!r.ok) return {};
      return r.json();
    },
    staleTime: 60_000,
  });

  const { data: chalets = [], isLoading } = useQuery<OwnerChalet[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) return [];
      return r.json();
    },
  });

  useEffect(() => {
    if (chalets.length > 0 && selectedChaletId === null) {
      setSelectedChaletId(chalets[0].id);
    }
  }, [chalets, selectedChaletId]);

  const { data: invitations = [] } = useQuery<{ id: number; chaletId: number; token: string; used: boolean; createdAt: string }[]>({
    queryKey: ["owner", "review-invitations"],
    queryFn: async () => {
      const r = await apiFetch("/owner/review-invitations");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const generateLink = useMutation({
    mutationFn: async (chaletId: number) => {
      const r = await apiFetch("/owner/review-invite", {
        method: "POST",
        body: JSON.stringify({ chaletId }),
      });
      if (!r.ok) throw new Error("failed");
      return r.json() as Promise<{ token: string; chaletName: string }>;
    },
    onSuccess: (data, chaletId) => {
      const origin = window.location.origin;
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const link = `${origin}${base}/r/${data.token}`;
      setGeneratedLinks((prev) => ({ ...prev, [chaletId]: link }));
      qc.invalidateQueries({ queryKey: ["owner", "review-invitations"] });
    },
  });

  const deleteInvitation = useMutation({
    mutationFn: async (invId: number) => {
      const r = await apiFetch(`/owner/review-invitations/${invId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "review-invitations"] }),
  });

  const saveTemplate = useMutation({
    mutationFn: async ({ chaletId, template }: { chaletId: number; template: string }) => {
      const r = await apiFetch(`/owner/chalets/${chaletId}/review-template`, {
        method: "PATCH",
        body: JSON.stringify({ waReviewTemplate: template }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: (_, { chaletId }) => {
      qc.invalidateQueries({ queryKey: ["owner", "chalets"] });
      setTemplateSaved(chaletId);
      setTimeout(() => setTemplateSaved(null), 2500);
    },
  });

  const { data: ownerReviews = [], isLoading: reviewsLoading } = useQuery<OwnerReviewRow[]>({
    queryKey: ["owner", "reviews"],
    queryFn: async () => {
      const r = await apiFetch("/owner/reviews");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ reviewId, reply }: { reviewId: number; reply: string }) => {
      const r = await apiFetch(`/owner/reviews/${reviewId}/reply`, {
        method: "POST",
        body: JSON.stringify({ reply }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: (_, { reviewId }) => {
      qc.invalidateQueries({ queryKey: ["owner", "reviews"] });
      setReplyingId(null);
      setReplyDraft((prev) => { const next = { ...prev }; delete next[reviewId]; return next; });
    },
  });

  const reportMutation = useMutation({
    mutationFn: async ({ reviewId, reason }: { reviewId: number; reason: string }) => {
      const r = await apiFetch(`/owner/reviews/${reviewId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      if (!r.ok) throw new Error("failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "reviews"] });
      setReportConfirmId(null);
      setReportReasonDraft("");
    },
  });

  function copyLink(chaletId: number) {
    const link = generatedLinks[chaletId];
    if (!link) return;
    navigator.clipboard.writeText(link);
    setCopiedId(chaletId);
    setTimeout(() => setCopiedId(null), 2500);
  }

  function sendWhatsApp(chalet: OwnerChalet) {
    const link = generatedLinks[chalet.id];
    if (!link) return;
    const template =
      templateDraft[chalet.id] ??
      chalet.waReviewTemplate ??
      siteSettings.wa_review_template ??
      DEFAULT_REVIEW_TEMPLATE;
    const text = template
      .replace(/\{link\}/g, link)
      .replace(/\{chalet_name\}/g, chalet.nameAr ?? "شاليهنا")
      .replace(/\{guest_name\}/g, "");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  }

  function inviteStats(chaletId: number) {
    const all = invitations.filter((i) => i.chaletId === chaletId);
    return { total: all.length, used: all.filter((i) => i.used).length, pending: all.filter((i) => !i.used).length };
  }

  const selectedChalet = chalets.find((c) => c.id === selectedChaletId) ?? null;
  const currentLink = selectedChaletId ? generatedLinks[selectedChaletId] : null;
  const stats = selectedChaletId ? inviteStats(selectedChaletId) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* ── Notifications Inbox ── */}
      {notifications.length > 0 && (() => {
        const unread = notifications.filter((n) => !n.isRead);
        return (
          <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                </div>
                <span className="font-semibold text-sm text-foreground">الإشعارات</span>
                {unread.length > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5 leading-none">
                    {unread.length} جديد
                  </span>
                )}
              </div>
              {unread.length > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  disabled={markAllRead.isPending}
                  className="text-xs text-primary hover:underline underline-offset-2 font-medium"
                >
                  تحديد الكل كمقروء
                </button>
              )}
            </div>
            <div className="divide-y divide-border max-h-64 overflow-y-auto">
              {notifications.slice(0, 8).map((n) => (
                <div key={n.id} className={`flex items-start gap-3 px-5 py-3 text-sm ${n.isRead ? "opacity-60" : "bg-amber-50/60 dark:bg-amber-900/10"}`}>
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${n.isRead ? "bg-transparent" : n.type === "report_dismissed" ? "bg-red-500" : "bg-green-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-foreground leading-relaxed">{n.message}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(n.createdAt).toLocaleDateString("ar-SA")} · {new Date(n.createdAt).toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Header */}
      <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center">
            <Star className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-foreground">إرسال رابط التقييم للضيوف</h2>
            <p className="text-muted-foreground text-sm">أنشئ رابطاً خاصاً لكل ضيف ليقيّم تجربته</p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
      ) : chalets.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-10 text-center text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>لا توجد شاليهات مرتبطة بحسابك بعد</p>
        </div>
      ) : (
        <>
          {/* Chalet selector */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <p className="text-sm font-semibold text-foreground mb-3">اختر الشاليه</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {chalets.map((c) => {
                const selected = selectedChaletId === c.id;
                const st = inviteStats(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedChaletId(c.id)}
                    className={`flex items-center gap-3 p-4 rounded-xl border text-right transition-all ${
                      selected
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/40 hover:bg-muted/30"
                    }`}
                  >
                    {c.photos?.[0] ? (
                      <img src={c.photos[0]} alt={c.nameAr} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{c.nameAr}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {st.total === 0 ? "لا توجد دعوات مرسلة" : `${toAr(st.total)} دعوة — ${toAr(st.used)} مستخدمة`}
                      </p>
                    </div>
                    {selected && <CheckCircle className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Generate + Send section */}
          {selectedChalet && (
            <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-5">
              {/* Title + generate button */}
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="font-bold text-foreground">{selectedChalet.nameAr}</p>
                  {stats && stats.total > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {toAr(stats.total)} دعوة إجمالاً · {toAr(stats.pending)} معلقة · {toAr(stats.used)} مستخدمة
                    </p>
                  )}
                </div>
                <Button
                  onClick={() => generateLink.mutate(selectedChalet.id)}
                  disabled={generateLink.isPending}
                  className="gap-2 bg-primary hover:bg-primary/90"
                >
                  {generateLink.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4" />}
                  إنشاء رابط تقييم جديد
                </Button>
              </div>

              {/* Generated link + send */}
              {currentLink && (
                <div className="bg-muted/40 rounded-xl border border-border p-4 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">الرابط الجديد (صالح لمدة 30 يوماً)</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-background border border-border text-primary text-xs px-3 py-2.5 rounded-lg font-mono break-all">
                      {currentLink}
                    </code>
                    <Button size="sm" variant="outline" onClick={() => copyLink(selectedChalet.id)} className="shrink-0">
                      {copiedId === selectedChalet.id ? "✓ تم النسخ" : "نسخ"}
                    </Button>
                  </div>
                  <Button
                    className="w-full gap-2 bg-[#25D366] hover:bg-[#1ebe5a] text-white font-semibold"
                    onClick={() => sendWhatsApp(selectedChalet)}
                  >
                    <Phone className="w-4 h-4" />
                    إرسال عبر واتساب
                  </Button>
                </div>
              )}

              {/* Custom WhatsApp message template per chalet */}
              <div className="border border-border rounded-xl p-4 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">رسالة واتساب مخصصة</p>
                  <span className="text-xs text-muted-foreground mr-auto">ضع {"{link}"} حيث تريد الرابط</span>
                </div>
                <Textarea
                  dir="rtl"
                  rows={4}
                  placeholder={selectedChalet.waReviewTemplate ?? siteSettings.wa_review_template ?? DEFAULT_REVIEW_TEMPLATE}
                  value={templateDraft[selectedChalet.id] ?? selectedChalet.waReviewTemplate ?? ""}
                  onChange={(e) =>
                    setTemplateDraft((prev) => ({ ...prev, [selectedChalet.id]: e.target.value }))
                  }
                  className="text-sm resize-none"
                />
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">اترك الحقل فارغاً لاستخدام القالب الافتراضي الذي يضبطه الأدمن</p>
                  <Button
                    size="sm"
                    disabled={saveTemplate.isPending}
                    onClick={() =>
                      saveTemplate.mutate({
                        chaletId: selectedChalet.id,
                        template: templateDraft[selectedChalet.id] ?? selectedChalet.waReviewTemplate ?? "",
                      })
                    }
                    className="gap-1.5 shrink-0"
                  >
                    {saveTemplate.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : templateSaved === selectedChalet.id ? (
                      "✓ تم الحفظ"
                    ) : (
                      "حفظ الرسالة"
                    )}
                  </Button>
                </div>
              </div>

              {/* Invitations list with delete */}
              {stats && stats.total > 0 && (
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">الدعوات المرسلة</p>
                  <div className="space-y-1.5">
                    {invitations
                      .filter((i) => i.chaletId === selectedChalet.id)
                      .map((inv) => (
                        <div key={inv.id} className="flex items-center gap-2 py-2 border-b border-border last:border-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${inv.used ? "bg-green-500" : "bg-amber-400"}`} />
                          <code className="flex-1 text-xs text-muted-foreground font-mono truncate">
                            {window.location.origin}{import.meta.env.BASE_URL.replace(/\/$/, "")}/r/{inv.token}
                          </code>
                          <span className={`text-xs font-medium shrink-0 ${inv.used ? "text-green-600" : "text-amber-600"}`}>
                            {inv.used ? "مستخدم" : "معلق"}
                          </span>
                          <button
                            onClick={() => deleteInvitation.mutate(inv.id)}
                            disabled={deleteInvitation.isPending}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors shrink-0"
                            title="حذف الدعوة"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Submitted Reviews for selected chalet ── */}
          {selectedChalet && (() => {
            const chaletReviews = ownerReviews.filter((r) => r.chaletId === selectedChalet.id);
            if (reviewsLoading) return (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            );
            if (chaletReviews.length === 0) return (
              <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-sm">
                <Star className="w-8 h-8 mx-auto mb-2 opacity-30" />
                لا توجد تقييمات مستلمة لهذا الشاليه بعد
              </div>
            );
            return (
              <div className="bg-card border border-border rounded-2xl p-6 shadow-sm space-y-4">
                <p className="font-bold text-foreground">التقييمات الواردة ({toAr(chaletReviews.length)})</p>
                {chaletReviews.map((rev) => (
                  <div key={rev.id} className={`rounded-xl border p-4 space-y-3 ${rev.isHidden ? "border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800" : "border-border bg-muted/30"}`}>
                    {/* Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex gap-0.5" dir="ltr">
                        {[1,2,3,4,5].map((s) => (
                          <Star key={s} className="w-4 h-4" fill={s <= rev.rating ? "#f59e0b" : "transparent"} stroke={s <= rev.rating ? "#f59e0b" : "#9ca3af"} strokeWidth={1.5} />
                        ))}
                      </div>
                      {rev.isVerified && (
                        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" /> نزيل مؤكد
                        </span>
                      )}
                      {rev.isHidden && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full font-medium">
                          مخفي من قبل الإدارة
                        </span>
                      )}
                      {rev.reportedAt && !rev.isHidden && (
                        <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          تم الإبلاغ
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground mr-auto">
                        {new Date(rev.createdAt).toLocaleDateString("ar-SA")}
                      </span>
                    </div>

                    {/* Comment */}
                    {rev.comment && <p className="text-sm text-foreground leading-relaxed">{rev.comment}</p>}

                    {/* Photos */}
                    {rev.photoUrls?.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {rev.photoUrls.map((url, i) => (
                          <img key={i} src={url} alt="" className="w-14 h-14 rounded-lg object-cover border border-border cursor-pointer"
                            onClick={() => window.open(url, "_blank")}
                          />
                        ))}
                      </div>
                    )}

                    {/* Owner reply (existing) */}
                    {rev.ownerReply && replyingId !== rev.id && (
                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-1">
                        <p className="text-xs font-semibold text-green-700 dark:text-green-400">ردك على التقييم</p>
                        <p className="text-sm text-foreground leading-relaxed">{rev.ownerReply}</p>
                        <button
                          onClick={() => { setReplyingId(rev.id); setReplyDraft((p) => ({ ...p, [rev.id]: rev.ownerReply ?? "" })); }}
                          className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline"
                        >
                          تعديل الرد
                        </button>
                      </div>
                    )}

                    {/* Reply form */}
                    {replyingId === rev.id ? (
                      <div className="space-y-2">
                        <Textarea
                          dir="rtl"
                          rows={3}
                          placeholder="اكتب ردك على هذا التقييم..."
                          value={replyDraft[rev.id] ?? ""}
                          onChange={(e) => setReplyDraft((p) => ({ ...p, [rev.id]: e.target.value }))}
                          className="text-sm resize-none"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={replyMutation.isPending || !(replyDraft[rev.id] ?? "").trim()}
                            onClick={() => replyMutation.mutate({ reviewId: rev.id, reply: (replyDraft[rev.id] ?? "").trim() })}
                          >
                            {replyMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                            نشر الرد
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setReplyingId(null)}>إلغاء</Button>
                        </div>
                      </div>
                    ) : !rev.ownerReply ? (
                      <button
                        onClick={() => setReplyingId(rev.id)}
                        className="flex items-center gap-1.5 text-sm text-primary hover:underline underline-offset-2 font-medium"
                      >
                        <MessageSquare className="w-4 h-4" />
                        الرد على هذا التقييم
                      </button>
                    ) : null}

                    {/* Report button (only if not already reported and not hidden) */}
                    {!rev.reportedAt && !rev.isHidden && (
                      reportConfirmId === rev.id ? (
                        <div className="flex flex-col gap-2 text-sm border border-amber-200 dark:border-amber-700 rounded-lg p-3 bg-amber-50 dark:bg-amber-900/10">
                          <span className="text-amber-700 dark:text-amber-400 font-medium">سبب الإبلاغ عن هذا التقييم:</span>
                          <Textarea
                            value={reportReasonDraft}
                            onChange={(e) => setReportReasonDraft(e.target.value)}
                            placeholder="اذكر سبب الإبلاغ بوضوح..."
                            rows={2}
                            className="text-sm resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                if (!reportReasonDraft.trim()) return;
                                reportMutation.mutate({ reviewId: rev.id, reason: reportReasonDraft.trim() });
                              }}
                              disabled={reportMutation.isPending || !reportReasonDraft.trim()}
                              className="text-red-600 hover:text-red-700 font-semibold disabled:opacity-40"
                            >
                              {reportMutation.isPending ? "جاري..." : "إرسال البلاغ"}
                            </button>
                            <button onClick={() => { setReportConfirmId(null); setReportReasonDraft(""); }} className="text-muted-foreground">إلغاء</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setReportConfirmId(rev.id); setReportReasonDraft(""); }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
                        >
                          <AlertTriangle className="w-3.5 h-3.5" />
                          الإبلاغ عن هذا التقييم
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Tip card when nothing selected */}
          {!selectedChalet && (
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 text-sm text-amber-800 dark:text-amber-300 flex gap-3">
              <Star className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
              <p>اختر شاليهاً من الأعلى لإنشاء رابط التقييم وإرساله عبر واتساب للضيف مباشرة</p>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

/* ── DepositsTab ─────────────────────────────── */
interface DepositEntry {
  id: number;
  clientName: string;
  clientPhone?: string | null;
  bookingDate: string;
  durationDays: number;
  period?: string | null;
  insuranceFee: string;
  insuranceRefunded: boolean;
  insuranceDeducted?: string | null;
  insuranceDeductReason?: string | null;
  insuranceProofImages?: string | null;
  submissionId?: number | null;
  chaletTitle?: string | null;
  cancelledAt?: string | null;
}

function DepositsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [refundConfirm, setRefundConfirm] = useState<DepositEntry | null>(null);
  const [deductDialog, setDeductDialog] = useState<DepositEntry | null>(null);
  const [deductAmount, setDeductAmount] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [proofUrls, setProofUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "resolved">("all");
  const [lightboxImg, setLightboxImg] = useState<string | null>(null);

  const { data: deposits = [], isLoading } = useQuery<DepositEntry[]>({
    queryKey: ["owner", "deposits"],
    queryFn: async () => {
      const r = await apiFetch("/owner/deposits");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: Record<string, unknown> }) => {
      const r = await apiFetch(`/owner/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error("فشل");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["owner", "deposits"] });
      queryClient.invalidateQueries({ queryKey: ["owner", "bookings"] });
    },
  });

  const handleRefund = async () => {
    if (!refundConfirm) return;
    try {
      await patchMutation.mutateAsync({
        id: refundConfirm.id,
        patch: { insuranceRefunded: true, insuranceDeducted: 0, insuranceDeductReason: null },
      });
      toast({ title: "✅ تم تسجيل إعادة التأمين بنجاح" });
      setRefundConfirm(null);
    } catch {
      toast({ title: "حدث خطأ أثناء التحديث", variant: "destructive" });
    }
  };

  const handlePhotoUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await fetch(`${BASE}/api/storage/uploads/process`, {
          credentials: "include",
          method: "POST",
          body: fd,
        });
        if (!r.ok) throw new Error("upload failed");
        const data = await r.json();
        newUrls.push(data.url as string);
      }
      setProofUrls((prev) => [...prev, ...newUrls]);
      toast({ title: `✅ تم رفع ${toAr(newUrls.length)} صورة بنجاح` });
    } catch {
      toast({ title: "فشل رفع الصورة", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDeduct = async () => {
    if (!deductDialog) return;
    const amount = Number(deductAmount);
    if (!amount || amount <= 0) {
      toast({ title: "أدخل مبلغ الخصم بشكل صحيح", variant: "destructive" });
      return;
    }
    if (!deductReason.trim()) {
      toast({ title: "أدخل سبب الخصم", variant: "destructive" });
      return;
    }
    const maxDeduct = Number(deductDialog.insuranceFee);
    if (amount > maxDeduct) {
      toast({ title: `لا يمكن الخصم أكثر من مبلغ التأمين (${toAr(maxDeduct)} ر.س)`, variant: "destructive" });
      return;
    }
    try {
      await patchMutation.mutateAsync({
        id: deductDialog.id,
        patch: {
          insuranceRefunded: true,
          insuranceDeducted: amount,
          insuranceDeductReason: deductReason,
          insuranceProofImages: proofUrls,
        },
      });
      toast({ title: "✅ تم توثيق الخصم بنجاح" });
      setDeductDialog(null);
      setDeductAmount("");
      setDeductReason("");
      setProofUrls([]);
    } catch {
      toast({ title: "حدث خطأ أثناء الحفظ", variant: "destructive" });
    }
  };

  const filtered = useMemo(() => {
    if (filterStatus === "pending") return deposits.filter((d) => !d.insuranceRefunded);
    if (filterStatus === "resolved") return deposits.filter((d) => d.insuranceRefunded);
    return deposits;
  }, [deposits, filterStatus]);

  const pendingCount = deposits.filter((d) => !d.insuranceRefunded).length;

  const periodLabel = (p?: string | null) => {
    if (p === "morning") return "🌅 صباحي";
    if (p === "evening") return "🌙 مسائي";
    if (p === "full_day") return "☀️ كامل";
    return "";
  };

  const getStatus = (d: DepositEntry): "pending" | "refunded" | "deducted" => {
    if (!d.insuranceRefunded) return "pending";
    if (d.insuranceDeducted && Number(d.insuranceDeducted) > 0) return "deducted";
    return "refunded";
  };

  const fmtMoney = (n: number | string) =>
    Number(n).toLocaleString("ar-SA", { maximumFractionDigits: 0 });

  const parseProofImgs = (raw?: string | null): string[] => {
    try { return JSON.parse(raw ?? "[]"); } catch { return []; }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">إدارة التأمينات</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            جميع الحجوزات التي تحتوي على مبلغ تأمين
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="self-start sm:self-auto bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-sm font-semibold px-3 py-1.5 rounded-full">
            🔒 {toAr(pendingCount)} بانتظار القرار
          </span>
        )}
      </div>

      {/* Summary Cards */}
      {deposits.length > 0 && (() => {
        const totalDeposits = deposits.reduce((s, d) => s + Number(d.insuranceFee), 0);
        const totalDeducted = deposits.reduce((s, d) => s + Number(d.insuranceDeducted ?? 0), 0);
        const totalRefundable = deposits
          .filter((d) => !d.insuranceRefunded)
          .reduce((s, d) => s + Number(d.insuranceFee), 0);
        return (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-xl p-3 text-center">
              <div className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-1">إجمالي التأمينات</div>
              <div className="text-lg font-bold text-orange-700 dark:text-orange-300">{fmtMoney(totalDeposits)}</div>
              <div className="text-xs text-muted-foreground">ر.س</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-xl p-3 text-center">
              <div className="text-xs text-red-600 dark:text-red-400 font-medium mb-1">إجمالي التلفيات</div>
              <div className="text-lg font-bold text-red-700 dark:text-red-300">{fmtMoney(totalDeducted)}</div>
              <div className="text-xs text-muted-foreground">ر.س</div>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-center">
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium mb-1">محتجز (معلّق)</div>
              <div className="text-lg font-bold text-amber-700 dark:text-amber-300">{fmtMoney(totalRefundable)}</div>
              <div className="text-xs text-muted-foreground">ر.س</div>
            </div>
          </div>
        );
      })()}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "pending", "resolved"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`text-sm px-3 py-1.5 rounded-full font-medium transition-colors ${
              filterStatus === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {s === "all" ? "الكل" : s === "pending" ? "🔒 معلّق" : "✅ مُنتهٍ"}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      )}

      {/* Empty */}
      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Lock className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">لا توجد تأمينات {filterStatus !== "all" ? "في هذه الفئة" : ""}</p>
          <p className="text-sm mt-1">ستظهر هنا الحجوزات التي تحتوي على مبلغ تأمين</p>
        </div>
      )}

      {/* Cards */}
      {!isLoading && filtered.map((d) => {
        const status = getStatus(d);
        const isCancelled = !!d.cancelledAt;
        const ins = Number(d.insuranceFee);
        const deducted = Number(d.insuranceDeducted ?? 0);
        const refundable = Math.max(0, ins - deducted);
        const proofImgs = parseProofImgs(d.insuranceProofImages);

        return (
          <div
            key={d.id}
            className={`rounded-2xl border p-4 space-y-3 transition-all ${
              isCancelled
                ? "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/5 opacity-75"
                : status === "pending"
                ? "border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/5"
                : status === "deducted"
                ? "border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/5"
                : "border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/5"
            }`}
          >
            {/* Row 1: Client + status badge */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-foreground truncate">{d.clientName}</div>
                {d.clientPhone && (
                  <div className="text-xs text-muted-foreground mt-0.5" dir="ltr">{toAr(d.clientPhone)}</div>
                )}
                {d.chaletTitle && (
                  <div className="text-xs text-muted-foreground mt-0.5">🏡 {d.chaletTitle}</div>
                )}
                <div className="text-xs text-muted-foreground mt-0.5">
                  📅 {d.bookingDate}
                  {d.durationDays > 1 && ` · ${toAr(d.durationDays)} أيام`}
                  {d.period && ` · ${periodLabel(d.period)}`}
                </div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1">
                {isCancelled && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300">✕ ملغى</span>
                )}
                {!isCancelled && status === "pending" && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300">🔒 معلّق</span>
                )}
                {status === "refunded" && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">✅ مُعاد</span>
                )}
                {status === "deducted" && (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">✂️ مخصوم</span>
                )}
              </div>
            </div>

            {/* Row 2: Finance formula */}
            <div className="bg-background/60 rounded-xl border border-border/50 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">مبلغ التأمين الأصلي</span>
                <span className="font-bold text-orange-600 dark:text-orange-400">{fmtMoney(ins)} ر.س</span>
              </div>
              {deducted > 0 && (
                <div className="flex items-center justify-between text-sm mt-1.5">
                  <span className="text-muted-foreground">المبلغ المخصوم (تلفيات)</span>
                  <span className="font-bold text-red-600 dark:text-red-400">− {fmtMoney(deducted)} ر.س</span>
                </div>
              )}
              <div className="border-t border-border/50 mt-2 pt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-foreground">المبلغ المُستردّ</span>
                <span className={`font-bold text-lg ${refundable > 0 ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                  {fmtMoney(refundable)} ر.س
                </span>
              </div>
            </div>

            {/* Deduction reason */}
            {d.insuranceDeductReason && (
              <div className="text-sm bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/50 rounded-lg px-3 py-2">
                <span className="font-semibold text-red-700 dark:text-red-400">سبب الخصم: </span>
                <span className="text-red-800 dark:text-red-300">{d.insuranceDeductReason}</span>
              </div>
            )}

            {/* Proof image thumbnails */}
            {proofImgs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground">📸 صور التوثيق ({toAr(proofImgs.length)})</p>
                <div className="flex gap-2 flex-wrap">
                  {proofImgs.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => setLightboxImg(url)}
                      className="w-16 h-16 rounded-lg overflow-hidden border border-border hover:border-primary transition-colors shrink-0"
                    >
                      <img
                        src={url.startsWith("http") ? url : `${BASE}${url}`}
                        alt={`توثيق ${toAr(i + 1)}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons — hidden for cancelled bookings */}
            {status === "pending" && !isCancelled && (
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20 gap-1.5"
                  onClick={() => setRefundConfirm(d)}
                >
                  <CheckCircle className="w-4 h-4" />
                  إعادة التأمين
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 gap-1.5"
                  onClick={() => {
                    setDeductDialog(d);
                    setDeductAmount("");
                    setDeductReason("");
                    setProofUrls([]);
                  }}
                >
                  <Camera className="w-4 h-4" />
                  خصم مع توثيق
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {/* Refund Confirm Dialog */}
      <Dialog open={!!refundConfirm} onOpenChange={(o) => !o && setRefundConfirm(null)}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد إعادة التأمين</DialogTitle>
            <DialogDescription>
              هل تؤكد إعادة مبلغ التأمين كاملاً (
              <strong>{refundConfirm ? fmtMoney(Number(refundConfirm.insuranceFee)) : 0} ر.س</strong>)
              للعميل <strong>{refundConfirm?.clientName}</strong>؟
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setRefundConfirm(null)}>إلغاء</Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleRefund}
              disabled={patchMutation.isPending}
            >
              {patchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "✅ تأكيد الإعادة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deduct Dialog */}
      <Dialog open={!!deductDialog} onOpenChange={(o) => !o && setDeductDialog(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>خصم مع توثيق الضرر</DialogTitle>
            <DialogDescription>
              تأمين <strong>{deductDialog?.clientName}</strong> — الأصلي:{" "}
              <strong className="text-orange-600">{deductDialog ? fmtMoney(Number(deductDialog.insuranceFee)) : 0} ر.س</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">مبلغ الخصم (ر.س) *</label>
              <Input
                type="text"
                inputMode="numeric"
                placeholder={`أقصى مبلغ: ${deductDialog ? fmtMoney(Number(deductDialog.insuranceFee)) : 0}`}
                value={toAr(deductAmount)}
                onChange={(e) => {
                  const raw = e.target.value
                    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
                    .replace(/[^\d.]/g, "");
                  setDeductAmount(raw);
                }}
                className="text-right"
              />
              {/* Live formula preview */}
              {deductAmount && deductDialog && Number(deductAmount) > 0 && (
                <div className="bg-muted/50 rounded-lg px-3 py-2 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">الأصلي</span>
                    <span className="font-medium">{fmtMoney(Number(deductDialog.insuranceFee))} ر.س</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>الخصم</span>
                    <span className="font-medium">− {fmtMoney(Number(deductAmount))} ر.س</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1 font-bold">
                    <span>المستردّ</span>
                    <span className={Math.max(0, Number(deductDialog.insuranceFee) - Number(deductAmount)) > 0 ? "text-green-600" : "text-muted-foreground"}>
                      {fmtMoney(Math.max(0, Number(deductDialog.insuranceFee) - Number(deductAmount)))} ر.س
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">سبب الخصم *</label>
              <Textarea
                placeholder="مثال: كسر في المرآة، بقع على السجادة..."
                value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
                rows={2}
                className="text-right resize-none"
              />
            </div>

            {/* Photo Upload */}
            <div className="space-y-2">
              <label className="text-sm font-medium">صور التوثيق (اختياري)</label>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={(e) => handlePhotoUpload(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 border-dashed"
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ الرفع...</>
                ) : (
                  <><Camera className="w-4 h-4" /> التقاط صورة أو اختيار من المعرض</>
                )}
              </Button>
              {proofUrls.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {proofUrls.map((url, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                      <img
                        src={url.startsWith("http") ? url : `${BASE}${url}`}
                        alt={`صورة ${toAr(i + 1)}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        onClick={() => setProofUrls((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute inset-0 bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                      >
                        حذف
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                يمكنك رفع صور متعددة للتأكد من توثيق الضرر. تعمل مع كاميرا الجوال مباشرة.
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2 pt-1">
            <Button variant="outline" onClick={() => setDeductDialog(null)}>إلغاء</Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
              onClick={handleDeduct}
              disabled={patchMutation.isPending || uploading}
            >
              {patchMutation.isPending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <><Archive className="w-4 h-4" /> حفظ الخصم والتوثيق</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <img
            src={lightboxImg.startsWith("http") ? lightboxImg : `${BASE}${lightboxImg}`}
            alt="صورة التوثيق"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="absolute top-4 left-4 text-white bg-black/50 rounded-full p-2"
            onClick={() => setLightboxImg(null)}
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ── Seasons Tab ─────────────────────────────── */
function SeasonsTab({ ownerChalets }: { ownerChalets: any[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedSubId, setSelectedSubId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [nameAr, setNameAr] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [priceMorning, setPriceMorning] = useState("");
  const [priceEvening, setPriceEvening] = useState("");
  const [priceFullDay, setPriceFullDay] = useState("");
  const [dailyPricesState, setDailyPricesState] = useState<Record<string, { morning: string; evening: string; fullDay: string }>>({});
  const [saving, setSaving] = useState(false);

  const activeSubId = selectedSubId ?? ownerChalets[0]?.submissionId ?? null;

  /* Generate ordered list of dates in range */
  const dayList = useMemo<string[]>(() => {
    if (!startDate || !endDate || endDate < startDate) return [];
    const days: string[] = [];
    const cur = new Date(startDate + "T12:00:00");
    const end = new Date(endDate + "T12:00:00");
    while (cur <= end) {
      days.push(cur.toISOString().split("T")[0]);
      cur.setDate(cur.getDate() + 1);
    }
    return days;
  }, [startDate, endDate]);

  const AR_DAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
  const AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];
  const toWest = (v: string) => v.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");

  function setDayField(ds: string, field: "morning" | "evening" | "fullDay", raw: string) {
    const val = toWest(raw);
    setDailyPricesState(prev => ({ ...prev, [ds]: { ...(prev[ds] ?? { morning: "", evening: "", fullDay: "" }), [field]: val } }));
  }

  function applyToAll() {
    if (!dayList.length) return;
    const entry = { morning: priceMorning, evening: priceEvening, fullDay: priceFullDay };
    const next: Record<string, { morning: string; evening: string; fullDay: string }> = {};
    dayList.forEach(ds => { next[ds] = { ...entry }; });
    setDailyPricesState(next);
  }

  const { data: seasons = [], isLoading } = useQuery<ChaletSeason[]>({
    queryKey: ["owner", "seasons", activeSubId],
    queryFn: async () => {
      if (!activeSubId) return [];
      const r = await apiFetch(`/owner/seasons?submissionId=${activeSubId}`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeSubId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/owner/seasons/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner", "seasons"] }); toast({ title: "تم حذف الموسم" }); },
  });

  const periodLabel = (p: string | null) => {
    if (!p) return "جميع الفترات";
    if (p === "morning") return "صباحي";
    if (p === "evening") return "مسائي";
    return "يوم كامل";
  };

  const normPrice = (v: string) => v ? Number(v) : undefined;

  async function handleAdd() {
    const hasSeasonPrice = !!(priceMorning || priceEvening || priceFullDay);
    const hasDailyPrice = Object.values(dailyPricesState).some(dp => dp.morning || dp.evening || dp.fullDay);
    if (!activeSubId || !nameAr.trim() || !startDate || !endDate || (!hasSeasonPrice && !hasDailyPrice)) return;
    setSaving(true);
    try {
      /* Build dailyPrices payload — only include days in range with at least one price */
      const dpPayload: Record<string, DayPrice> = {};
      dayList.forEach(ds => {
        const dp = dailyPricesState[ds];
        if (!dp) return;
        const entry: DayPrice = {};
        if (dp.morning) entry.morning = Number(dp.morning);
        if (dp.evening) entry.evening = Number(dp.evening);
        if (dp.fullDay) entry.fullDay = Number(dp.fullDay);
        if (Object.keys(entry).length > 0) dpPayload[ds] = entry;
      });
      const r = await apiFetch("/owner/seasons", {
        method: "POST",
        body: JSON.stringify({
          submissionId: activeSubId,
          nameAr: nameAr.trim(),
          startDate,
          endDate,
          priceMorning: normPrice(priceMorning),
          priceEvening: normPrice(priceEvening),
          priceFullDay: normPrice(priceFullDay),
          dailyPrices: Object.keys(dpPayload).length > 0 ? dpPayload : undefined,
        }),
      });
      if (!r.ok) { const e = await r.json(); toast({ title: e.error ?? "خطأ", variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["owner", "seasons"] });
      toast({ title: "تم إضافة الموسم بنجاح" });
      setAddOpen(false);
      setNameAr(""); setStartDate(""); setEndDate("");
      setPriceMorning(""); setPriceEvening(""); setPriceFullDay("");
      setDailyPricesState({});
    } finally { setSaving(false); }
  }

  if (ownerChalets.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">لا يوجد شاليه معتمد بعد. بعد موافقة الإدارة يمكنك إضافة المواسم.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-bold text-foreground text-lg">المواسم والأعياد</h3>
          <p className="text-sm text-muted-foreground">حدد فترات بأسعار خاصة تُطبَّق تلقائياً على الحجوزات</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} className="gap-1.5 rounded-xl">
          <Plus className="w-4 h-4" />
          إضافة موسم
        </Button>
      </div>

      {/* Chalet selector if multiple */}
      {ownerChalets.length > 1 && activeSubId && (
        <Select value={String(activeSubId)} onValueChange={(v) => setSelectedSubId(Number(v))}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="اختر الشاليه" />
          </SelectTrigger>
          <SelectContent>
            {ownerChalets.map((c: any) => (
              <SelectItem key={c.id} value={String(c.submissionId)}>{c.nameAr}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Seasons list */}
      {isLoading ? (
        <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : seasons.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl py-10 text-center">
          <Sun className="w-9 h-9 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">لا توجد مواسم مضافة بعد</p>
          <p className="text-xs text-muted-foreground/60 mt-1">أضف موسماً كالإجازات والأعياد بأسعار خاصة</p>
        </div>
      ) : (
        <div className="space-y-3">
          {seasons.map((s) => {
            const days = Math.round((new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 86400000) + 1;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <Sun className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{s.nameAr}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                    <span>{s.startDate.split("-").reverse().join("/")} → {s.endDate.split("-").reverse().join("/")}</span>
                    <span>({toAr(days)} يوم)</span>
                  </div>
                  {/* Price display — variable daily pricing or fixed */}
                  {(() => {
                    const dp = s.dailyPrices;
                    const dpEntries = dp ? Object.values(dp) : [];
                    const hasDaily = dpEntries.length > 0;
                    if (hasDaily) {
                      const allPrices = dpEntries.flatMap(e => [e.morning, e.evening, e.fullDay].filter(Boolean) as number[]);
                      const minP = Math.min(...allPrices);
                      const maxP = Math.max(...allPrices);
                      const isVariable = minP !== maxP;
                      return (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                          {isVariable ? (
                            <span className="text-amber-600 dark:text-amber-400 font-medium">
                              أسعار متغيرة (تبدأ من {toAr(minP)} ر.س)
                            </span>
                          ) : (
                            <span className="text-primary font-medium">
                              {toAr(minP)} ر.س / يوم
                            </span>
                          )}
                          <span className="text-muted-foreground/60">· {toAr(dpEntries.length)} يوم بأسعار مفصّلة</span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
                        {s.priceMorning && <span className="text-sky-700 dark:text-sky-400">☀️ {toAr(Number(s.priceMorning))} ر.س</span>}
                        {s.priceEvening && <span className="text-indigo-700 dark:text-indigo-400">🌙 {toAr(Number(s.priceEvening))} ر.س</span>}
                        {s.priceFullDay && <span className="text-emerald-700 dark:text-emerald-400">📅 {toAr(Number(s.priceFullDay))} ر.س</span>}
                        {!s.priceMorning && !s.priceEvening && !s.priceFullDay && (
                          <span className="text-primary font-semibold">{toAr(Number(s.price))} ر.س</span>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 w-8 h-8"
                    onClick={() => deleteMutation.mutate(s.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Info box */}
      <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/40 px-4 py-3 flex items-start gap-3">
        <Activity className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
          عند إضافة حجز في نطاق تاريخ موسم، يظهر تنبيه بالسعر الموسمي تلقائياً في نافذة الحجز.
          يمكنك استخدامه لتطبيق أسعار الأعياد والإجازات والمواسم دون الحاجة لتغيير السعر الأساسي.
        </p>
      </div>

      {/* Add Season Dialog */}
      <Dialog open={addOpen} onOpenChange={(v) => { if (!v) { setAddOpen(false); setDailyPricesState({}); } }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Sun className="w-4 h-4 text-amber-500" />
              إضافة موسم جديد
            </DialogTitle>
            <DialogDescription>حدد اسم الموسم ونطاق التواريخ وأسعار كل يوم</DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 space-y-4 py-2 pl-1">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">اسم الموسم</label>
              <div className="flex gap-2 flex-wrap">
                {["عيد الأضحى", "عيد الفطر", "رمضان", "الإجازة الصيفية", "نهاية السنة", "الإجازة الشتوية"].map((n) => (
                  <button key={n} onClick={() => setNameAr(n)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${nameAr === n ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-foreground"}`}>
                    {n}
                  </button>
                ))}
              </div>
              <Input className="mt-2" placeholder="اسم الموسم..." value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
                <DualCalendarPicker value={startDate} onChange={setStartDate} placeholder="من تاريخ" label="من تاريخ" />
              </div>
              <div className="rounded-xl border border-border bg-background px-3 py-2.5 min-h-[3rem]">
                <DualCalendarPicker value={endDate} onChange={setEndDate} placeholder="إلى تاريخ" label="إلى تاريخ" minDate={startDate || undefined} />
              </div>
            </div>

            {/* Default (apply-to-all) prices */}
            <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="text-sm font-semibold text-amber-800 dark:text-amber-300">الأسعار الافتراضية (ر.س)</label>
                {dayList.length > 0 && (
                  <button
                    type="button"
                    onClick={applyToAll}
                    disabled={!priceMorning && !priceEvening && !priceFullDay}
                    className="text-xs font-medium px-3 py-1 rounded-full bg-amber-600 text-white disabled:opacity-40 hover:bg-amber-700 transition-colors"
                  >
                    تطبيق على كل الأيام ({toAr(dayList.length)})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { label: "☀️ صباحي", val: priceMorning, set: setPriceMorning },
                  { label: "🌙 مسائي", val: priceEvening, set: setPriceEvening },
                  { label: "📅 يوم كامل", val: priceFullDay, set: setPriceFullDay },
                ] as const).map(({ label, val, set }) => (
                  <div key={label} className="space-y-1">
                    <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">{label}</span>
                    <Input
                      type="text" inputMode="numeric" placeholder="٠"
                      value={val ? toAr(val) : ""}
                      onChange={(e) => (set as (v: string) => void)(toWest(e.target.value))}
                      className="h-8 text-right text-sm"
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-500">أدخل الأسعار ثم اضغط "تطبيق على كل الأيام"، أو عدّل كل يوم بشكل منفرد أدناه</p>
            </div>

            {/* Daily price rows */}
            {dayList.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold">التسعير اليومي التفصيلي</label>
                  <span className="text-xs text-muted-foreground">{toAr(dayList.length)} يوم</span>
                </div>
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_90px_90px_90px] gap-1.5 px-1 text-xs text-muted-foreground font-medium">
                  <span>اليوم والتاريخ</span>
                  <span className="text-center">☀️ صباحي</span>
                  <span className="text-center">🌙 مسائي</span>
                  <span className="text-center">📅 كامل</span>
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-muted/20 p-2">
                  {dayList.map((ds) => {
                    const d = new Date(ds + "T12:00:00");
                    const dp = dailyPricesState[ds] ?? { morning: "", evening: "", fullDay: "" };
                    const dayName = AR_DAYS[d.getDay()];
                    const dayNum = toAr(d.getDate());
                    const monthName = AR_MONTHS[d.getMonth()];
                    const isFriday = d.getDay() === 5;
                    const isSaturday = d.getDay() === 6;
                    const { hijri } = formatDualDate(ds);
                    const hijriClean = hijri.replace(/\s*هـ\s*$/, "");
                    return (
                      <div
                        key={ds}
                        className={`grid grid-cols-[1fr_90px_90px_90px] items-center gap-1.5 py-1.5 px-1 rounded-lg border-b border-border/30 last:border-0 ${isFriday || isSaturday ? "bg-amber-50/60 dark:bg-amber-950/20" : ""}`}
                      >
                        <div className="text-xs leading-tight min-w-0">
                          <p className={`text-[10px] font-semibold ${isFriday ? "text-emerald-600" : isSaturday ? "text-sky-600" : "text-muted-foreground"}`}>{dayName}</p>
                          <p className="font-bold text-foreground truncate">{hijriClean} هـ</p>
                          <p className="text-[10px] text-muted-foreground/70">{dayNum} {monthName}</p>
                        </div>
                        {(["morning", "evening", "fullDay"] as const).map((field) => (
                          <Input
                            key={field}
                            type="text" inputMode="numeric" placeholder="—"
                            value={dp[field] ? toAr(dp[field]) : ""}
                            onChange={(e) => setDayField(ds, field, e.target.value)}
                            className="h-7 text-center text-xs px-1"
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* No dates selected hint */}
            {!startDate || !endDate ? (
              <div className="text-center py-3 text-xs text-muted-foreground">
                اختر نطاق التواريخ أعلاه لتظهر الأيام التفصيلية
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2 shrink-0 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => { setAddOpen(false); setDailyPricesState({}); }}>إلغاء</Button>
            <Button
              disabled={
                !nameAr.trim() || !startDate || !endDate || startDate > endDate ||
                !(priceMorning || priceEvening || priceFullDay || Object.values(dailyPricesState).some(dp => dp.morning || dp.evening || dp.fullDay)) ||
                saving
              }
              onClick={handleAdd}
              className="gap-1.5"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              حفظ الموسم
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

/* ════════════════════════════════════════════════════════════════
   CRM — Customers Tab
   ════════════════════════════════════════════════════════════════ */
interface CustomerRow {
  client_name: string;
  client_phone: string;
  total_bookings: string;
  total_revenue: string;
  last_booking_date: string;
}

interface BookingRow {
  id: number;
  booking_date: string;
  duration_days: number;
  period: string;
  total_price: string;
  chalet_name: string | null;
  cancelled_at: string | null;
}

interface CustomerProfile {
  clientName: string;
  clientPhone: string;
  totalBookings: number;
  totalRevenue: number;
  lastBookingDate: string;
  bookings: BookingRow[];
  note: string;
}

const PERIOD_LABEL: Record<string, string> = {
  morning:  "صباحي",
  evening:  "مسائي",
  full_day: "يومي كامل",
  fullday:  "يومي كامل",
};

function CustomersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch]           = useState("");
  const [selected, setSelected]       = useState<string | null>(null);
  const [profile, setProfile]         = useState<CustomerProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError]     = useState(false);
  const [note, setNote]               = useState("");
  const [savingNote, setSavingNote]   = useState(false);

  /* ── Edit modal state ── */
  const [editOpen, setEditOpen]   = useState(false);
  const [editName, setEditName]   = useState("");
  const [editPhone, setEditPhone] = useState("");

  /* ── Delete confirmation state ── */
  const [deleteOpen, setDeleteOpen] = useState(false);

  /* ── Edit mutation ── */
  const editMutation = useMutation({
    mutationFn: async ({ oldPhone, name, phone }: { oldPhone: string; name: string; phone: string }) => {
      const r = await apiFetch(`/owner/customers/${encodeURIComponent(oldPhone)}`, {
        method: "PUT",
        body: JSON.stringify({ name, phone }),
      });
      if (!r.ok) throw new Error("فشل تحديث بيانات العميل");
      return r.json() as Promise<{ ok: boolean; newPhone: string }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["owner", "customers"] });
      const newPhone = data.newPhone ?? selected!;
      setSelected(newPhone);
      loadProfile(newPhone);
      setEditOpen(false);
      toast({ title: "تم تحديث بيانات العميل بنجاح" });
    },
    onError: () => toast({ title: "حدث خطأ أثناء التحديث", variant: "destructive" }),
  });

  /* ── Delete mutation ── */
  const deleteMutation = useMutation({
    mutationFn: async (phone: string) => {
      const r = await apiFetch(`/owner/customers/${encodeURIComponent(phone)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("فشل حذف العميل");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["owner", "customers"] });
      setSelected(null);
      setProfile(null);
      setDeleteOpen(false);
      toast({ title: "تم حذف العميل وسجلّ حجوزاته" });
    },
    onError: () => toast({ title: "حدث خطأ أثناء الحذف", variant: "destructive" }),
  });

  const { data: customers = [], isLoading } = useQuery<CustomerRow[]>({
    queryKey: ["owner", "customers"],
    queryFn: async () => {
      const r = await apiFetch("/owner/customers");
      if (!r.ok) return [];
      const data = await r.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const filtered = customers.filter(
    (c) =>
      c.client_name.includes(search) ||
      c.client_phone.includes(search)
  );

  async function loadProfile(phone: string) {
    setSelected(phone);
    setProfile(null);
    setProfileError(false);
    setProfileLoading(true);
    try {
      const r = await apiFetch(`/owner/customers/${encodeURIComponent(phone)}`);
      if (r.ok) {
        const data: CustomerProfile = await r.json();
        setProfile(data);
        setNote(data.note ?? "");
      } else {
        setProfileError(true);
      }
    } catch {
      setProfileError(true);
    }
    setProfileLoading(false);
  }

  async function handleSaveNote() {
    if (!selected) return;
    setSavingNote(true);
    await apiFetch(`/owner/customers/${encodeURIComponent(selected)}/note`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: note }),
    });
    setSavingNote(false);
    toast({ title: "تم حفظ الملاحظة" });
  }

  const statCard = (label: string, value: string) => (
    <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground">{value}</p>
    </div>
  );

  return (
    <div className="flex gap-4 min-h-[520px]" dir="rtl">
      {/* ── Left panel: customer list ── */}
      <div className={`flex flex-col gap-3 ${selected ? "hidden lg:flex lg:w-72 shrink-0" : "w-full"}`}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">عملائي</h2>
          <span className="text-xs text-muted-foreground">{toAr(customers.length)} عميل</span>
        </div>

        <div className="relative">
          <Search className="absolute end-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو الجوال…"
            className="pe-9 text-sm"
            dir="rtl"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary w-6 h-6" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            {search ? "لا توجد نتائج" : "لا يوجد عملاء بعد — أضف أول حجز لعميلك"}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filtered.map((c) => (
              <button
                key={c.client_phone}
                onClick={() => loadProfile(c.client_phone)}
                className={`w-full text-start rounded-xl border px-4 py-3 transition-colors hover:border-primary/50 hover:bg-accent/30 ${
                  selected === c.client_phone
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-foreground truncate">{c.client_name}</p>
                  <span className="shrink-0 text-xs font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                    {toAr(Number(c.total_bookings))} حجز
                  </span>
                </div>
                <p dir="ltr" className="text-xs text-muted-foreground mt-0.5 text-right">{c.client_phone}</p>
                {c.last_booking_date && (() => {
                  const { hijri, gregorian } = formatDualDate(c.last_booking_date);
                  return (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      آخر حجز:{" "}
                      <span className="text-foreground/80">
                        {hijri.replace(/\s*هـ\s*$/, "")} هـ
                      </span>
                      <span className="mx-1 opacity-40">/</span>
                      <span>{gregorian}</span>
                    </p>
                  );
                })()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Right panel: profile ── */}
      {selected && (
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          {/* Back button (mobile) */}
          <button
            onClick={() => { setSelected(null); setProfile(null); }}
            className="lg:hidden flex items-center gap-1.5 text-sm text-primary font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            العودة للقائمة
          </button>

          {profileLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary w-6 h-6" /></div>
          ) : profileError ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <svg className="w-8 h-8 text-destructive/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <p className="text-sm font-medium">تعذّر تحميل بيانات العميل</p>
              <button
                onClick={() => selected && loadProfile(selected)}
                className="text-xs text-primary hover:underline"
              >
                إعادة المحاولة
              </button>
            </div>
          ) : !profile ? null : (
            <>
              {/* Basic info */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start gap-4 mb-4">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-lg font-bold text-foreground">{profile.clientName}</p>
                    <p dir="ltr" className="text-sm text-muted-foreground">{profile.clientPhone}</p>
                  </div>
                  {/* Edit & Delete actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditName(profile.clientName);
                        setEditPhone(profile.clientPhone);
                        setEditOpen(true);
                      }}
                      className="p-2 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title="تعديل بيانات العميل"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteOpen(true)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="حذف العميل"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-3 gap-3">
                  {statCard(
                    "إجمالي الحجوزات",
                    `${toAr(profile.totalBookings)} حجز`
                  )}
                  {statCard(
                    "إجمالي الإيراد",
                    `${toAr(Math.round(profile.totalRevenue))} ر.س`
                  )}
                  {statCard(
                    "آخر حجز",
                    profile.lastBookingDate ? formatDualDate(profile.lastBookingDate).hijri.replace(/\s*هـ\s*$/, "") + " هـ" : "—"
                  )}
                </div>
              </div>

              {/* Booking history */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  سجل الحجوزات ({toAr(profile.bookings.length)})
                </h3>
                {profile.bookings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">لا توجد حجوزات</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground text-xs">
                          <th className="pb-2 text-right font-medium">التاريخ</th>
                          <th className="pb-2 text-right font-medium">الشاليه</th>
                          <th className="pb-2 text-right font-medium">الفترة</th>
                          <th className="pb-2 text-right font-medium">المبلغ</th>
                          <th className="pb-2 text-right font-medium">الحالة</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {profile.bookings.map((b) => (
                          <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                            <td className="py-2.5">
                              <span className="text-foreground font-medium block">
                                {b.booking_date ? formatDualDate(b.booking_date).hijri.replace(/\s*هـ\s*$/, "") + " هـ" : "—"}
                              </span>
                              {b.booking_date && (
                                <span className="text-xs text-muted-foreground">
                                  {formatDualDate(b.booking_date).gregorian}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 text-muted-foreground truncate max-w-[120px]">
                              {b.chalet_name ?? "—"}
                            </td>
                            <td className="py-2.5 text-muted-foreground">
                              {PERIOD_LABEL[b.period] ?? b.period}
                              {b.duration_days > 1 && ` (${toAr(b.duration_days)} أيام)`}
                            </td>
                            <td className="py-2.5 font-semibold text-foreground">
                              {toAr(Math.round(Number(b.total_price)))} ر.س
                            </td>
                            <td className="py-2.5">
                              {b.cancelled_at ? (
                                <span className="text-xs font-semibold text-red-500 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 rounded-full">ملغي</span>
                              ) : (
                                <span className="text-xs font-semibold text-green-600 bg-green-50 dark:bg-green-950/30 px-2 py-0.5 rounded-full">مؤكد</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Private notes */}
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="font-bold text-sm text-foreground mb-1 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  ملاحظات خاصة
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  هذه الملاحظات مخفية تماماً عن العميل — تُستخدم للتذكير والملاحظات الداخلية فقط
                </p>
                <Textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="مثال: عميل VIP، يفضّل الفترة الصباحية، التواصل عبر الجوال…"
                  rows={4}
                  className="text-sm resize-none"
                  dir="rtl"
                />
                <div className="flex justify-end mt-3">
                  <Button
                    size="sm"
                    onClick={handleSaveNote}
                    disabled={savingNote}
                    className="gap-2"
                  >
                    {savingNote ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                    حفظ الملاحظة
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Edit Customer Modal ── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تعديل بيانات العميل</DialogTitle>
            <DialogDescription>يمكنك تحديث الاسم أو رقم الجوال. سيُطبَّق التغيير على جميع حجوزات هذا العميل.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">الاسم</label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="اسم العميل"
                dir="rtl"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">رقم الجوال</label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                placeholder="05xxxxxxxx"
                dir="ltr"
                className="text-left"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-row-reverse sm:flex-row-reverse">
            <Button
              onClick={() =>
                editMutation.mutate({ oldPhone: selected!, name: editName.trim(), phone: editPhone.trim() })
              }
              disabled={editMutation.isPending || !editName.trim() || !editPhone.trim()}
              className="flex-1"
            >
              {editMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              حفظ التغييرات
            </Button>
            <Button variant="outline" onClick={() => setEditOpen(false)} className="flex-1">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ── */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              تأكيد الحذف
            </DialogTitle>
            <DialogDescription className="text-base leading-relaxed pt-1">
              هل أنت متأكد من حذف العميل وسجل حجوزاته؟
              <br />
              <span className="font-semibold text-foreground">{profile?.clientName}</span>
              {" — "}
              <span dir="ltr">{profile?.clientPhone}</span>
              <br />
              <span className="text-destructive/80 text-sm">لا يمكن التراجع عن هذه العملية.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 flex-row-reverse sm:flex-row-reverse">
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate(selected!)}
              disabled={deleteMutation.isPending}
              className="flex-1"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              نعم، احذف العميل
            </Button>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} className="flex-1">
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────── */
export default function Dashboard() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"chalets" | "reviews" | "customers" | "services" | "calendar" | "revenue" | "expenses" | "staff" | "reports" | "deposits" | "seasons">("chalets");
  const [showHeaderUpgrade, setShowHeaderUpgrade] = useState<"chalet" | "service" | null>(null);
  const { user, isLoading: authLoading, isAuthenticated, logout, login } = useAuth();
  const { isStaff, staffUser, permissions, isLoading: staffLoading, logout: staffLogout } = useStaffAuth();

  /* ── Admin impersonation detection (must be before queries) ── */
  const [impersonation, setImpersonation] = useState<{
    impersonating: boolean; adminName?: string; ownerName?: string; ownerId?: string;
  }>({ impersonating: false });
  const [impersonationLoading, setImpersonationLoading] = useState(true);
  const [editEnabled, setEditEnabled] = useState(false);

  useEffect(() => {
    apiFetch("/admin/impersonation-status")
      .then((r) => r.ok ? r.json() : { impersonating: false })
      .then(setImpersonation)
      .finally(() => setImpersonationLoading(false));
  }, []);

  async function endImpersonation() {
    await apiFetch("/admin/impersonate/end", { method: "POST" });
    window.location.href = `${BASE}/admin`;
  }

  async function handleEnableEdit() {
    await apiFetch("/admin/audit-log", {
      method: "POST",
      body: JSON.stringify({
        action: editEnabled ? "DISABLE_EDIT_MODE" : "ENABLE_EDIT_MODE",
        targetOwnerId: impersonation.ownerId ?? "",
      }),
    }).catch(() => {});
    setEditEnabled((prev) => !prev);
  }

  const isImpersonating = impersonation.impersonating;
  const isDemo = impersonation.ownerId === "__demo_preview__";
  const isReadOnly = isImpersonating && !editEnabled && !isDemo;

  function onBlockedEdit() {
    toast({ title: "وضع القراءة فقط", description: "فعّل وضع التعديل من الشريط العلوي أولاً", variant: "destructive" });
  }

  const { data: submissions, isLoading: submissionsLoading } = useGetMySubmissions();

  const { data: ownerChalets = [] } = useQuery<any[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      return r.ok ? r.json() : [];
    },
    enabled: isAuthenticated || isStaff || isImpersonating,
  });

  const { data: planLimits } = useQuery<{ plan: string; chaletLimit: number; chaletCount: number; serviceLimit: number }>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) return { plan: "trial", chaletLimit: 1, chaletCount: 0, serviceLimit: 1 };
      return r.json();
    },
    enabled: isAuthenticated || isImpersonating,
  });

  const { data: subscription } = useQuery<{ plan: string; status: string; expiresAt: string | null; paymentStatus: string } | null>({
    queryKey: ["owner", "subscription-header"],
    queryFn: async () => {
      const r = await apiFetch("/owner/subscription");
      if (!r.ok) return null;
      return r.json();
    },
    enabled: isAuthenticated || isImpersonating,
  });

  const { data: notifSummary = [] } = useQuery<{ id: number; isRead: boolean }[]>({
    queryKey: ["owner", "notifications-summary"],
    queryFn: async () => {
      const r = await apiFetch("/owner/notifications");
      if (!r.ok) return [];
      return r.json();
    },
    enabled: isAuthenticated || isStaff || isImpersonating,
    refetchInterval: 30_000,
  });
  const unreadNotifCount = notifSummary.filter((n) => !n.isRead).length;

  const allTabs = [
    { id: "chalets",   label: "شاليهاتي",          icon: <Building2 className="w-4 h-4" /> },
    { id: "seasons",   label: "المواسم",             icon: <Sun className="w-4 h-4" /> },
    { id: "reviews",   label: "التقييمات",           icon: <Star className="w-4 h-4" /> },
    { id: "customers", label: "عملائي",              icon: <Users className="w-4 h-4" /> },
    { id: "services",  label: "خدماتي",             icon: <MessageSquare className="w-4 h-4" /> },
    { id: "calendar",  label: "التقويم والحجوزات",  icon: <Calendar className="w-4 h-4" /> },
    { id: "revenue",   label: "الإيرادات",           icon: <TrendingUp className="w-4 h-4" /> },
    { id: "expenses",  label: "المصروفات",           icon: <Wallet className="w-4 h-4" /> },
    { id: "staff",     label: "الموظفون",            icon: <Users className="w-4 h-4" /> },
    { id: "reports",   label: "التقارير",            icon: <BarChart2 className="w-4 h-4" /> },
    { id: "deposits",  label: "التأمينات",            icon: <Lock className="w-4 h-4" /> },
  ] as const;

  const tabs = useMemo(() => {
    if (!isStaff) return allTabs;
    return allTabs.filter((tab) => {
      const permKey = TAB_PERMISSION[tab.id];
      if (!permKey || permKey === "__owner__") return false;
      return permissions[permKey as PermKey] === true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStaff, permissions]);

  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.id === activeTab)) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const isLoadingAuth = authLoading || staffLoading;

  const isFullyLoading  = isLoadingAuth || impersonationLoading;
  const canAccess       = isAuthenticated || isStaff || isImpersonating;

  useEffect(() => {
    if (!isFullyLoading && !canAccess) {
      if (!isStaff) {
        login("/dashboard");
      } else {
        navigate("/staff-login");
      }
    }
  }, [isFullyLoading, canAccess, isStaff, login, navigate]);

  if (isFullyLoading) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <Navbar />
        <div className="container mx-auto px-4 py-12 max-w-4xl space-y-6">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!canAccess) return null;

  return (
    <ImpersonationCtx.Provider value={{ isReadOnly, onBlockedEdit }}>
    <div className="min-h-screen bg-background" dir="rtl">
      {/* ── Demo Preview Banner ── */}
      {isDemo && (
        <div className="sticky top-0 z-50 w-full px-4 py-2 flex items-center justify-between gap-3 flex-wrap bg-emerald-600 text-white" dir="rtl">
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>
              <span className="font-bold">وضع العرض التجريبي</span>
              <span className="mx-2 opacity-70">—</span>
              <span className="opacity-90 font-normal">البيانات افتراضية لا تؤثر على أي مستخدم حقيقي</span>
            </span>
          </div>
          <button
            onClick={endImpersonation}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/30 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
            العودة للإدارة
          </button>
        </div>
      )}

      {/* ── Impersonation Banner (real owner, not demo) ── */}
      {isImpersonating && !isDemo && (
        <div
          className={`sticky top-0 z-50 w-full px-4 py-2 flex items-center justify-between gap-3 flex-wrap ${editEnabled ? "bg-red-600 text-white" : "bg-amber-500 text-amber-950"}`}
          dir="rtl"
        >
          {/* Left: status label */}
          <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>
              معاينة كمدير
              {editEnabled
                ? <span className="mr-1 font-bold">(وضع التعديل نشط — مسجّل)</span>
                : <span className="mr-1 opacity-80">(وضع القراءة فقط)</span>
              }
              —&nbsp;
              <span className="font-bold">{impersonation.ownerName ?? "مالك"}</span>
            </span>
            {impersonation.adminName && (
              <span className="font-normal opacity-60 text-xs hidden sm:inline">
                ({impersonation.adminName})
              </span>
            )}
          </div>
          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Enable / Disable Edit toggle */}
            <button
              onClick={handleEnableEdit}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                editEnabled
                  ? "bg-white/20 hover:bg-white/30 border-white/30 text-white"
                  : "bg-amber-950/10 hover:bg-amber-950/20 border-amber-950/20 text-amber-950"
              }`}
            >
              {editEnabled ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                  إيقاف التعديل
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" /></svg>
                  تفعيل التعديل
                </>
              )}
            </button>
            {/* Return to admin */}
            <button
              onClick={endImpersonation}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                editEnabled
                  ? "bg-white/20 hover:bg-white/30 text-white border border-white/30"
                  : "bg-amber-950/15 hover:bg-amber-950/25 text-amber-950"
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              العودة للوحة المشرف العام
            </button>
          </div>
        </div>
      )}
      <Navbar />

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Profile Card — adapts for owner vs staff */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`border border-border rounded-3xl p-6 md:p-8 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-5 shadow-sm ${isStaff ? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-card"}`}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 ${isStaff ? "bg-blue-100 dark:bg-blue-900/40" : "bg-primary/10"}`}>
            {!isStaff && user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt={user.firstName ?? ""} className="w-16 h-16 rounded-2xl object-cover" />
            ) : isStaff ? (
              <UserCheck className="w-8 h-8 text-blue-600" />
            ) : (
              <User className="w-8 h-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            {isStaff ? (
              <>
                <h1 className="text-2xl font-bold text-foreground">أهلاً، {staffUser?.name ?? "عزيزنا"} 👋</h1>
                <p className="text-muted-foreground mt-1">أنت مسجّل دخول كموظف — صلاحياتك محددة من قبل صاحب العمل</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ALL_PERM_KEYS.filter((k) => permissions[k]).map((k) => (
                    <span key={k} className="inline-flex items-center gap-1 text-[11px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full px-2 py-0.5 font-medium">
                      {PERM_LABELS[k].icon} {PERM_LABELS[k].label}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-foreground">أهلاً، {user?.firstName ?? "عزيزنا"} 👋</h1>
                <p className="text-muted-foreground mt-1">لوحة تحكمك الموحدة — الشاليهات والخدمات في مكان واحد</p>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {!isStaff && (
              <>
                {planLimits && (submissions?.length ?? 0) >= planLimits.chaletLimit ? (
                  <Button variant="outline" className="rounded-xl font-semibold text-sm" onClick={() => setShowHeaderUpgrade("chalet")}>
                    <Lock className="w-4 h-4 me-1.5 text-amber-500" />
                    إضافة شاليه
                  </Button>
                ) : (
                  <Link href="/add-chalet">
                    <Button variant="outline" className="rounded-xl font-semibold text-sm">
                      <Plus className="w-4 h-4 me-1.5" />
                      إضافة شاليه
                    </Button>
                  </Link>
                )}
                <Link href="/add-service-provider">
                  <Button className="rounded-xl font-semibold text-sm">
                    <Plus className="w-4 h-4 me-1.5" />
                    إضافة خدمة
                  </Button>
                </Link>
              </>
            )}
            <Button
              variant="ghost"
              onClick={() => isStaff ? staffLogout() : logout()}
              className="rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive text-sm px-3"
            >
              <LogOut className="w-4 h-4 me-1.5" />
              خروج
            </Button>
          </div>
        </motion.div>
        <UpgradePlanDialog
          open={showHeaderUpgrade !== null}
          onClose={() => setShowHeaderUpgrade(null)}
          context={showHeaderUpgrade ?? "chalet"}
        />

        {/* Subscription / Account Settings — clickable banner */}
        {subscription && (() => {
          const planLabels: Record<string, string> = {
            trial: "تجريبي", monthly: "شهري", yearly: "سنوي",
            chalet_basic: "شاليه — أساسي", chalet_pro: "شاليه — احترافي",
            chalet_unlimited: "شاليه — غير محدود", service_basic: "خدمات — أساسي",
            service_pro: "خدمات — احترافي", bundle: "حزمة شاملة",
          };
          const statusCls: Record<string, string> = {
            active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
            trial:  "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
            expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
            suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
          };
          const days = subscription.expiresAt
            ? Math.ceil((new Date(subscription.expiresAt).getTime() - Date.now()) / 86_400_000)
            : null;
          return (
            <button
              type="button"
              onClick={() => navigate("/subscription")}
              className="mb-5 w-full bg-card border border-border rounded-2xl px-5 py-3 flex items-center gap-3 flex-wrap text-sm hover:bg-accent/40 transition-colors text-start cursor-pointer"
            >
              <CreditCard className="w-4 h-4 text-primary shrink-0" />
              <span className="font-semibold text-foreground">حسابي والاشتراك</span>
              <span className="font-medium text-muted-foreground">{planLabels[subscription.plan] ?? subscription.plan}</span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusCls[subscription.status] ?? "bg-muted text-muted-foreground"}`}>
                {{ active: "نشط ✓", trial: "تجريبي", expired: "منتهي", suspended: "موقوف" }[subscription.status] ?? subscription.status}
              </span>
              {days !== null && (
                <span className={`text-xs font-medium ${days < 7 ? "text-red-600" : "text-muted-foreground"}`}>
                  {Math.max(0, days)} يوم متبقي
                </span>
              )}
              <span className="ms-auto flex items-center gap-1.5 text-xs font-semibold text-primary">
                إدارة
                <ExternalLink className="w-3.5 h-3.5" />
              </span>
            </button>
          );
        })()}

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-border overflow-x-auto pb-0 -mx-1 px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
              {tab.id === "reviews" && unreadNotifCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
                  {unreadNotifCount > 9 ? "9+" : unreadNotifCount}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "chalets" && (
          <ChaletsTab submissions={submissions as any[]} isLoading={submissionsLoading} ownerChalets={ownerChalets} />
        )}
        {activeTab === "seasons" && (
          <SeasonsTab ownerChalets={ownerChalets} />
        )}
        {activeTab === "reviews" && (
          <ReviewsTab />
        )}
        {activeTab === "customers" && (
          <CustomersTab />
        )}
        {activeTab === "services" && (
          <ServiceSubmissionsTab />
        )}
        {activeTab === "calendar" && (
          <BookingCalendarTab submissions={submissions as any[] ?? []} />
        )}
        {activeTab === "revenue" && (
          <RevenueTab />
        )}
        {activeTab === "expenses" && (
          <ExpensesTab />
        )}
        {activeTab === "staff" && (
          <StaffTab />
        )}
        {activeTab === "reports" && (
          <ReportsTab />
        )}
        {activeTab === "deposits" && (
          <DepositsTab />
        )}
      </div>
    </div>
    </ImpersonationCtx.Provider>
  );
}
