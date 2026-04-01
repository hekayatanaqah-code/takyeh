import { useEffect, useState, useMemo, useRef, type ReactElement } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useAuth } from "@workspace/replit-auth-web";
import { useGetMySubmissions } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  User, LogOut, Plus, MapPin, Calendar, Clock, CheckCircle,
  XCircle, Home, BookOpen, Trash2, Building2, Globe, Phone, AlertTriangle,
  RotateCcw, Star, ChevronLeft, ChevronRight, BarChart2, CreditCard,
  TrendingUp, Sunrise, Moon, Sun, Lock, Zap, DollarSign, Users,
  Wallet, Receipt, TrendingDown, Edit2, UserCheck, ChevronDown, ChevronUp,
  Camera, Loader2,
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
  bookingDate: string;
  durationDays: number;
  source: "platform" | "external";
  notes?: string | null;
  period?: string | null;
  createdAt: string;
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

function ChaletsTab({ submissions, isLoading }: { submissions: any[] | undefined; isLoading: boolean }) {
  const [showUpgrade, setShowUpgrade] = useState(false);

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
              {submissions.length} / {planLimits.chaletLimit === 999 ? "∞" : planLimits.chaletLimit} شاليه
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
      {submissions.map((sub: any, idx: number) => {
        const status = statusConfig[sub.status as keyof typeof statusConfig] ?? statusConfig.pending;
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
  open, onClose, submissions, onAdded,
}: {
  open: boolean;
  onClose: () => void;
  submissions: any[];
  onAdded: () => void;
}) {
  const [clientName, setClientName] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [period, setPeriod] = useState<string>("");
  const [source, setSource] = useState<"platform" | "external">("external");
  const [submissionId, setSubmissionId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !bookingDate) { setError("يرجى ملء الحقول المطلوبة"); return; }
    setSaving(true); setError("");
    try {
      const r = await apiFetch("/owner/bookings", {
        method: "POST",
        body: JSON.stringify({
          clientName,
          bookingDate,
          durationDays,
          period: period && period !== "none" ? period : undefined,
          source,
          notes: notes || undefined,
          submissionId: submissionId ? Number(submissionId) : undefined,
        }),
      });
      if (!r.ok) { setError("حدث خطأ، يرجى المحاولة مجدداً"); return; }
      onAdded();
      onClose();
      setClientName(""); setBookingDate(""); setDurationDays(1); setPeriod(""); setSource("external"); setSubmissionId(""); setNotes("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-right">إضافة حجز يدوي خارجي</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">لتسجيل حجوزات قادمة من واتساب أو انستقرام أو أي مصدر خارج المنصة</p>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">اسم العميل *</label>
            <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="اسم العميل" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">تاريخ الحجز *</label>
            <Input type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">عدد الأيام</label>
            <Input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">الفترة الزمنية (اختياري)</label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger><SelectValue placeholder="اختر الفترة" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                <SelectItem value="morning">🌅 صباحي</SelectItem>
                <SelectItem value="evening">🌙 مسائي</SelectItem>
                <SelectItem value="full_day">☀️ يوم كامل</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
          {submissions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">الشاليه (اختياري)</label>
              <Select value={submissionId} onValueChange={setSubmissionId}>
                <SelectTrigger><SelectValue placeholder="اختر الشاليه" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {submissions.map((s: any) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.nameAr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-semibold">ملاحظات (اختياري)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي ملاحظات إضافية..." />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ الحجز"}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>إلغاء</Button>
          </div>
        </form>
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
function MiniCalendar({
  year, month, availability, onDateClick,
}: {
  year: number;
  month: number;
  availability: ChaletAvailability[];
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

  const today = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 gap-px mb-1">
        {arabicDays.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-1">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const entry = availMap.get(dateStr);
          const isBlocked = entry && (entry.periodMorning || entry.periodEvening || entry.periodFullDay);
          const isPartial = entry && !entry.periodFullDay && (entry.periodMorning || entry.periodEvening);
          const isToday = dateStr === today;

          return (
            <button
              key={dateStr}
              onClick={() => onDateClick(dateStr)}
              className={`relative aspect-square rounded-lg text-xs font-medium transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
                isBlocked
                  ? isPartial
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                    : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  : "hover:bg-primary/10 text-foreground"
              } ${isToday ? "ring-2 ring-primary font-bold" : ""}`}
            >
              {day}
              {isBlocked && (
                <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full ${isPartial ? "bg-amber-500" : "bg-red-500"}`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Booking Calendar Tab ────────────────────── */
function BookingCalendarTab({ submissions }: { submissions: any[] }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedChaletId, setSelectedChaletId] = useState<number | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [blockDateStr, setBlockDateStr] = useState<string | null>(null);

  const { data: ownerChalets = [], isLoading: chaletsLoading } = useQuery<any[]>({
    queryKey: ["owner", "chalets"],
    queryFn: async () => {
      const r = await apiFetch("/owner/chalets");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const activeChaletId = selectedChaletId ?? ownerChalets[0]?.id ?? null;

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

  const deleteBooking = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch(`/owner/bookings/${id}`, { method: "DELETE" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["owner", "bookings"] }),
  });

  const calAvailability = useMemo(() => {
    return availability.filter((a) => {
      const [y, m] = a.dateStr.split("-").map(Number);
      return y === calYear && m === calMonth;
    });
  }, [availability, calYear, calMonth]);

  const blockEntry = blockDateStr ? availability.find((a) => a.dateStr === blockDateStr) ?? null : null;

  const monthLabel = new Date(calYear, calMonth - 1, 1).toLocaleDateString("ar-SA", { year: "numeric", month: "long" });

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
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="w-4 h-4 me-2" />
          إضافة حجز يدوي
        </Button>
      </div>

      <AddBookingDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        submissions={submissions}
        onAdded={() => qc.invalidateQueries({ queryKey: ["owner", "bookings"] })}
      />

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
                onDateClick={(ds) => {
                  if (!activeChaletId) return;
                  setBlockDateStr(ds);
                }}
              />
            )}

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-200 inline-block" />محجوز بالكامل</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-200 inline-block" />محجوز جزئياً</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-muted inline-block" />متاح</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">انقر على أي تاريخ لضبط الفترات المحجوزة.</p>
          </>
        )}
      </div>

      {/* Bookings List */}
      <div>
        <h3 className="font-bold text-foreground mb-4">قائمة الحجوزات</h3>
        {bookingsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : bookings.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-10 text-center">
            <BookOpen className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-base font-semibold mb-2">لا توجد حجوزات بعد</h3>
            <p className="text-sm text-muted-foreground mb-4">سجّل حجوزاتك من واتساب وانستقرام لمتابعة تقويمك</p>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 me-2" />
              إضافة أول حجز
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {bookings.map((b) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card border border-border rounded-xl p-4 flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  {b.source === "platform" ? <Globe className="w-5 h-5 text-primary" /> : <Phone className="w-5 h-5 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">{b.clientName}</p>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${b.source === "platform" ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-700"}`}>
                      {b.source === "platform" ? "المنصة" : "خارجي"}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {b.bookingDate}
                    </span>
                    <span>{b.durationDays} {b.durationDays === 1 ? "يوم" : "أيام"}</span>
                    {b.period && (
                      <span className="text-xs font-medium bg-primary/8 text-primary px-1.5 py-0.5 rounded">
                        {{ morning: "🌅 صباحي", evening: "🌙 مسائي", full_day: "☀️ يوم كامل" }[b.period as string] ?? b.period}
                      </span>
                    )}
                  </div>
                  {b.notes && <p className="text-xs text-muted-foreground mt-1">{b.notes}</p>}
                </div>
                <button
                  onClick={() => deleteBooking.mutate(b.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1"
                  aria-label="حذف الحجز"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

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
              <Input
                type="date"
                value={form.dateStr}
                onChange={(e) => setForm((f) => ({ ...f, dateStr: e.target.value }))}
                className="h-11"
                required
              />
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
                    onClick={() => { if (confirm("حذف هذا المصروف؟")) deleteMutation.mutate(exp.id); }}
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
interface StaffMember { id: number; name: string; baseSalary: string; isActive: boolean; }
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
  const qc = useQueryClient();
  const { user } = useAuth();
  const currentMonth = new Date().toISOString().slice(0, 7);
  /* ── state ── */
  const [addForm, setAddForm] = useState({ name: "", baseSalary: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: "", baseSalary: "" });
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["owner", "staff"] }); setAddForm({ name: "", baseSalary: "" }); },
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
          ownerName:  user?.name ?? user?.username ?? "صاحب العمل",
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
            const s = parseFloat(addForm.baseSalary);
            if (!addForm.name || isNaN(s)) return;
            addStaff.mutate({ name: addForm.name, baseSalary: s });
          }}
          className="flex gap-3 flex-wrap"
        >
          <Input placeholder="اسم الموظف" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} className="flex-1 min-w-[140px] h-11" required />
          <Input type="number" min="0" step="1" placeholder="الراتب الأساسي (ر.س)" value={addForm.baseSalary} onChange={(e) => setAddForm((f) => ({ ...f, baseSalary: e.target.value }))} className="flex-1 min-w-[160px] h-11" required />
          <Button type="submit" className="h-11 px-5 font-bold" disabled={addStaff.isPending}>
            <Plus className="w-4 h-4 me-1.5" />
            إضافة
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
                          <Button size="sm" onClick={() => editStaff.mutate({ id: member.id, data: { name: editForm.name, baseSalary: parseFloat(editForm.baseSalary) } })}>حفظ</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>إلغاء</Button>
                        </div>
                      ) : (
                        <>
                          <p className="font-bold text-foreground">{member.name}</p>
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
                        <button onClick={() => { if (confirm(`حذف ${member.name}؟`)) deleteStaff.mutate(member.id); }} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
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
                  const ownerName = user?.name ?? user?.username ?? "صاحب العمل";
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
                    const ownerName = user?.name ?? user?.username ?? "صاحب العمل";
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
                              ownerName:  user?.name ?? user?.username ?? "صاحب العمل",
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
                  disabled={paySalary.isPending}
                  onClick={() => {
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

function ReportsTab() {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string>("all");

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

  const slotLabels: Record<string, { icon: ReactElement; label: string }> = {
    morning:     { icon: <Sunrise className="w-4 h-4" />,  label: "صباحي" },
    evening:     { icon: <Moon className="w-4 h-4" />,     label: "مسائي" },
    full_day:    { icon: <Sun className="w-4 h-4" />,      label: "يوم كامل" },
    unspecified: { icon: <Clock className="w-4 h-4" />,    label: "غير محدد" },
  };

  const handleShareWhatsApp = () => {
    if (!report || !subscription) return;
    const text = `📊 تقرير شهر ${report.month}\n\n` +
      `📅 إجمالي الحجوزات: ${report.totalBookings}\n` +
      `📈 نسبة الإشغال: ${report.occupancyRate}%\n` +
      `🏆 الفترة الأكثر طلباً: ${report.topSlotLabel}\n` +
      `🔗 المنصة: ${report.platformBookings} | خارجي: ${report.externalBookings}\n\n` +
      `شاليهات القصيم — اشتراك نشط (بدون عمولة)`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

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
      {/* Subscription Card */}
      {subscription && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-bold text-foreground text-sm">الاشتراك والخطة</p>
              <p className="text-xs text-muted-foreground">نموذج بدون عمولة — سعر ثابت فقط</p>
            </div>
            <span className={`ms-auto text-xs font-semibold px-3 py-1 rounded-full ${statusLabels[subscription.status]?.className ?? "bg-muted text-muted-foreground"}`}>
              {statusLabels[subscription.status]?.label ?? subscription.status}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">الخطة الحالية</p>
              <p className="font-semibold">{planLabels[subscription.plan] ?? subscription.plan}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">تاريخ الانتهاء</p>
              <p className="font-semibold">
                {subscription.expiresAt
                  ? new Date(subscription.expiresAt).toLocaleDateString("ar-SA")
                  : "—"}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3">
              <p className="text-xs text-muted-foreground mb-1">حالة الدفع</p>
              <p className={`font-semibold ${subscription.paymentStatus === "paid" ? "text-green-600" : subscription.paymentStatus === "overdue" ? "text-red-600" : "text-amber-600"}`}>
                {{paid: "مدفوع ✓", pending: "قيد الدفع", overdue: "متأخر!"}[subscription.paymentStatus as string] ?? subscription.paymentStatus}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Report Filters */}
      <div className="bg-card border border-border rounded-2xl p-4 space-y-3">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-primary" />
          فلاتر التقرير
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Property filter */}
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground font-medium">العقار</label>
            <Select value={selectedSubmissionId} onValueChange={setSelectedSubmissionId}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder="كل العقارات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العقارات</SelectItem>
                {mySubmissions.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.nameAr ?? `شاليه #${s.id}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* Month filter */}
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground font-medium">الشهر</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="h-10">
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
        {selectedSubmissionId !== "all" && (
          <p className="text-xs text-primary font-medium flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            يعرض بيانات: {mySubmissions.find((s: any) => String(s.id) === selectedSubmissionId)?.nameAr ?? `شاليه #${selectedSubmissionId}`}
          </p>
        )}
      </div>

      {/* ── Financial Summary (P&L) ── */}
      {financial && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "إجمالي الإيرادات",
                value: formatAmount(financial.totalRevenue),
                icon: <TrendingUp className="w-5 h-5" />,
                color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                note: "من الحجوزات المسعّرة",
              },
              {
                label: "إجمالي المصروفات",
                value: formatAmount(financial.totalExpenses),
                icon: <TrendingDown className="w-5 h-5" />,
                color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                note: "مصروفات + رواتب",
              },
              {
                label: "صافي الربح",
                value: formatAmount(financial.netProfit),
                icon: <DollarSign className="w-5 h-5" />,
                color: financial.netProfit >= 0
                  ? "bg-primary/10 text-primary"
                  : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                note: "الإيرادات - المصروفات",
              },
            ].map((stat) => (
              <div key={stat.label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-2">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${stat.color}`}>{stat.icon}</div>
                <p className="text-xl font-bold text-foreground leading-none">{stat.value}</p>
                <p className="text-xs text-muted-foreground leading-tight">{stat.label}</p>
                <p className="text-[10px] text-muted-foreground/60">{stat.note}</p>
              </div>
            ))}
          </div>

          {/* Expense Breakdown */}
          {Object.keys(financial.categoryTotals).length > 0 && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" />
                توزيع المصروفات
              </h3>
              <div className="space-y-2">
                {Object.entries(financial.categoryTotals)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, amount]) => {
                    const cat = catMap[key] ?? { label: key, emoji: "✨", color: "bg-slate-100 text-slate-700" };
                    const pct = financial.totalExpenses > 0 ? Math.round((amount / financial.totalExpenses) * 100) : 0;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <span>{cat.emoji}</span>{cat.label}
                          </span>
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

          {/* Monthly Trend Chart */}
          {financial.trend.some((t) => t.revenue > 0 || t.expenses > 0) && (
            <div className="bg-card border border-border rounded-2xl p-5">
              <h3 className="font-bold text-foreground text-sm mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                مقارنة الإيرادات والمصروفات (آخر 6 أشهر)
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
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                    formatter={(value: number) => [formatAmount(value)]}
                  />
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
        <div className="space-y-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : !report ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
          <BarChart2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-4" />
          <p className="text-muted-foreground">لا توجد بيانات حجوزات لهذا الشهر</p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
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

          {/* Occupancy bar */}
          <div className="bg-card border border-border rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-foreground text-sm">نسبة الإشغال — {monthOptions.find(o => o.val === selectedMonth)?.label}</h3>
              <span className="text-2xl font-bold text-primary">{report.occupancyRate}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className="bg-primary h-3 rounded-full transition-all duration-500"
                style={{ width: `${report.occupancyRate}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">{report.totalDays} يوم محجوز من أصل {report.daysInMonth} يوم</p>
          </div>

          {/* Slot breakdown */}
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
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${isTop && count > 0 ? "bg-primary" : "bg-muted-foreground/40"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Share Report */}
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleShareWhatsApp} className="gap-2">
              <span>📤</span>
              مشاركة التقرير عبر واتساب
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Main Dashboard ──────────────────────────── */
export default function Dashboard() {
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"chalets" | "services" | "calendar" | "expenses" | "staff" | "reports">("chalets");
  const [showHeaderUpgrade, setShowHeaderUpgrade] = useState<"chalet" | "service" | null>(null);
  const { user, isLoading: authLoading, isAuthenticated, logout } = useAuth();
  const { data: submissions, isLoading: submissionsLoading } = useGetMySubmissions();

  const { data: planLimits } = useQuery<{ plan: string; chaletLimit: number; chaletCount: number; serviceLimit: number }>({
    queryKey: ["owner", "plan-limits"],
    queryFn: async () => {
      const r = await apiFetch("/owner/plan-limits");
      if (!r.ok) return { plan: "trial", chaletLimit: 1, chaletCount: 0, serviceLimit: 1 };
      return r.json();
    },
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading) {
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

  if (!isAuthenticated) return null;

  const tabs = [
    { id: "chalets",   label: "شاليهاتي",         icon: <Building2 className="w-4 h-4" /> },
    { id: "services",  label: "خدماتي",            icon: <Star className="w-4 h-4" /> },
    { id: "calendar",  label: "التقويم والحجوزات", icon: <Calendar className="w-4 h-4" /> },
    { id: "expenses",  label: "المصروفات",          icon: <Wallet className="w-4 h-4" /> },
    { id: "staff",     label: "الموظفون",           icon: <Users className="w-4 h-4" /> },
    { id: "reports",   label: "التقارير",           icon: <BarChart2 className="w-4 h-4" /> },
  ] as const;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Navbar />

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Owner Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card border border-border rounded-3xl p-6 md:p-8 mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-5 shadow-sm"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
            {user?.profileImageUrl ? (
              <img src={user.profileImageUrl} alt={user.firstName ?? ""} className="w-16 h-16 rounded-2xl object-cover" />
            ) : (
              <User className="w-8 h-8 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground">
              أهلاً، {user?.firstName ?? "عزيزنا"} 👋
            </h1>
            <p className="text-muted-foreground mt-1">لوحة تحكمك الموحدة — الشاليهات والخدمات في مكان واحد</p>
          </div>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
            <Button variant="ghost" onClick={logout} className="rounded-xl text-muted-foreground hover:text-destructive hover:border-destructive text-sm px-3">
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

        {/* Tabs */}
        <div className="flex gap-1 mb-8 border-b border-border overflow-x-auto pb-0 -mx-1 px-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "chalets" && (
          <ChaletsTab submissions={submissions as any[]} isLoading={submissionsLoading} />
        )}
        {activeTab === "services" && (
          <ServiceSubmissionsTab />
        )}
        {activeTab === "calendar" && (
          <BookingCalendarTab submissions={submissions as any[] ?? []} />
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
      </div>
    </div>
  );
}
